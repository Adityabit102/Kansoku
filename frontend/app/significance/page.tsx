"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api, type SignificanceRow } from "@/lib/api";
import { ErrorNote, Panel, PanelTitle, PageHeader, Skeleton, Stat, Tag } from "@/components/ui";

const DOMAINS = ["all", "time", "frequency", "wavelet"] as const;
type Domain = (typeof DOMAINS)[number];

/** p-values underflow to 0 at this sample size; say so rather than printing "0". */
function fmtP(p: number) {
  if (p === 0) return "< 1e-308";
  if (p < 0.001) return p.toExponential(1);
  return p.toFixed(4);
}

function EtaBar({ value, passes }: { value: number; passes: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: value }}
          viewport={{ once: true, margin: "-30px" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{
            transformOrigin: "left",
            background: passes ? "var(--color-sage)" : "var(--color-line)",
          }}
          className="h-full w-full"
        />
      </div>
      <span className="tabular w-12 font-[family-name:var(--font-mono)] text-xs text-ink">
        {value.toFixed(3)}
      </span>
    </div>
  );
}

export default function Significance() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["significance"],
    queryFn: api.significance,
  });
  const [domain, setDomain] = useState<Domain>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(
    () => (domain === "all" ? data : data?.filter((r) => r.domain === domain)) ?? [],
    [data, domain],
  );

  if (error) return <ErrorNote error={error} />;

  const passing = data?.filter((r) => r.passes_gate).length ?? 0;
  const pSignificant = data?.filter((r) => r.p_value < 0.05).length ?? 0;

  return (
    <>
      <PageHeader eyebrow="Validation" title="Feature significance">
        Every feature is tested before any model sees it. Levene&rsquo;s test checks variance
        homogeneity and routes each feature to ANOVA or Kruskal-Wallis; eta-squared then
        measures how much of the feature&rsquo;s variance the fault class actually explains.
        A feature must clear <span className="text-ink">both</span> to reach a model.
      </PageHeader>

      {isLoading ? (
        <Skeleton className="h-[600px]" />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat index={0} label="Extracted" value={`${data?.length ?? 0}`} sub="candidate features" />
            <Stat
              index={1}
              label="Pass p < 0.05"
              value={`${pSignificant}`}
              sub="statistically significant"
            />
            <Stat
              index={2}
              label="Pass the gate"
              value={`${passing}`}
              sub="also clear η² > 0.14"
              accent
            />
            <Stat
              index={3}
              label="Rejected"
              value={`${(data?.length ?? 0) - passing}`}
              sub="significant but weak"
            />
          </div>

          <Panel index={1} className="mb-3">
            <PanelTitle hint="why p-values alone are not enough">
              The sample-size trap
            </PanelTitle>
            <p className="text-sm leading-relaxed text-muted">
              All {data?.length ?? 36} features are &ldquo;statistically significant&rdquo;.
              That is not a finding — it is an artifact of {(5886).toLocaleString()} segments.
              Given enough samples, any difference, however meaningless, crosses p &lt; 0.05.
              Ranking or selecting on p-value would therefore justify nothing at all.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Effect size does not have that problem. Sorted by η² below, the table shows
              which features carry real class information — and{" "}
              <span className="text-ink">wv_detail_5_std</span>, significant at p ≈ 10⁻¹²⁸
              while explaining 3% of variance, shows exactly what the gate is for.
            </p>
          </Panel>

          <Panel index={2}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-sm font-medium text-ink">
                All features <span className="text-muted">· sorted by effect size</span>
              </h2>
              <div className="flex gap-1" role="group" aria-label="Filter by domain">
                {DOMAINS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDomain(d)}
                    aria-pressed={domain === d}
                    className={`rounded-full border px-3 py-1 text-[11px] capitalize transition-colors duration-200 ${
                      domain === d
                        ? "border-accent/50 bg-accent/10 text-ink"
                        : "border-line text-muted hover:border-accent/50 hover:text-ink"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="pb-3 font-normal">Feature</th>
                    <th className="pb-3 font-normal">Test</th>
                    <th className="pb-3 text-right font-normal">p-value</th>
                    <th className="pb-3 font-normal">η² (effect size)</th>
                    <th className="pb-3 text-right font-normal">Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: SignificanceRow) => {
                    const open = expanded === r.feature;
                    // Tukey pairs only exist for features that passed the gate,
                    // so rejected rows are not expandable — a click that does
                    // nothing would read as a broken control.
                    const expandable = r.passes_gate;
                    return (
                      <tr
                        key={r.feature}
                        onClick={
                          expandable ? () => setExpanded(open ? null : r.feature) : undefined
                        }
                        className={`border-b border-line/60 align-middle transition-colors duration-200 ${
                          expandable ? "cursor-pointer hover:bg-surface-2" : "opacity-60"
                        }`}
                      >
                        <td className="py-3">
                          <span className="font-[family-name:var(--font-mono)] text-xs text-ink">
                            {r.feature}
                          </span>
                          {open && r.separated_pairs.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                              className="mt-2 max-w-md"
                            >
                              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">
                                Tukey HSD separates
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {r.separated_pairs.map((p) => (
                                  <Tag key={p}>{p}</Tag>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </td>
                        <td className="py-3 text-xs text-muted">
                          {r.test_used === "anova" ? "ANOVA" : "Kruskal-Wallis"}
                        </td>
                        <td className="tabular py-3 text-right font-[family-name:var(--font-mono)] text-xs text-muted">
                          {fmtP(r.p_value)}
                        </td>
                        <td className="py-3">
                          <EtaBar value={r.eta_squared} passes={r.passes_gate} />
                        </td>
                        <td className="py-3 text-right">
                          <Tag tone={r.passes_gate ? "pass" : "fail"}>
                            {r.passes_gate ? "pass" : "reject"}
                          </Tag>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-muted">
              Select a passing row to see which fault-class pairs Tukey HSD says it
              separates. Rejected features are dimmed — no post-hoc test is run for them.
            </p>
          </Panel>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-6 max-w-3xl text-xs leading-relaxed text-muted"
          >
            Note: every feature routed to Kruskal-Wallis — Levene&rsquo;s test rejected
            variance homogeneity in all 36 cases, which is expected for vibration data, where
            spread itself changes with fault class. The ANOVA branch is implemented and
            correct, but never fires on this dataset.
          </motion.p>
        </>
      )}
    </>
  );
}
