"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api, fmtPct } from "@/lib/api";
import { ENTER, ErrorNote, Panel, PanelTitle, Skeleton, Stat, stagger } from "@/components/ui";

const ROUTES = [
  { href: "/signals", title: "Signals", body: "Raw waveforms and their FFT spectra, per fault class." },
  { href: "/significance", title: "Significance", body: "Which features earn their place in a model, and why." },
  { href: "/clusters", title: "Clusters", body: "Fault regimes discovered without labels." },
  { href: "/leaderboard", title: "Leaderboard", body: "Six algorithms, one split, ranked honestly." },
  { href: "/predict", title: "Diagnose", body: "Upload a signal and get a grounded classification." },
];

export default function Overview() {
  const manifest = useQuery({ queryKey: ["manifest"], queryFn: api.manifest });
  const leaderboard = useQuery({ queryKey: ["leaderboard"], queryFn: api.leaderboard });
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const significance = useQuery({ queryKey: ["significance"], queryFn: api.significance });

  const error = manifest.error ?? leaderboard.error ?? clusters.error ?? significance.error;
  if (error) return <ErrorNote error={error} />;

  const best = leaderboard.data?.[0];
  const gated = significance.data?.filter((r) => r.passes_gate).length;
  const loading = manifest.isLoading || leaderboard.isLoading;

  return (
    <>
      <motion.section {...ENTER} className="mb-12 max-w-3xl">
        <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-crimson">
          観測 · Observation
        </p>
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-bone md:text-5xl">
          Bearing faults, diagnosed and <span className="text-crimson">justified</span>.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted">
          Kansoku classifies bearing faults from raw vibration signals — and defends every
          step. Features must pass an effect-size gate before any model sees them, six
          algorithms are benchmarked on identical recording-grouped splits, and clustering
          runs unlabeled to surface regimes the labels never encoded.
        </p>
      </motion.section>

      <div className="mb-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)
        ) : (
          <>
            <Stat
              index={0}
              label="Best model"
              value={best ? fmtPct(best.cv_mean, 1) : "—"}
              sub={`${best?.model_name ?? ""} · cross-validated`}
              accent
            />
            <Stat
              index={1}
              label="Segments"
              value={manifest.data?.n_segments.toLocaleString() ?? "—"}
              sub="2048-sample windows, 50% overlap"
            />
            <Stat
              index={2}
              label="Features gated"
              value={significance.data ? `${gated}/${significance.data.length}` : "—"}
              sub="cleared p < 0.05 and η² > 0.14"
            />
            <Stat
              index={3}
              label="Regimes found"
              value={clusters.data ? `${clusters.data.chosen_k}` : "—"}
              sub={`unlabeled · vs ${manifest.data?.classes.length ?? 4} labeled classes`}
            />
          </>
        )}
      </div>

      <div className="mb-12 grid gap-3 lg:grid-cols-3">
        <Panel index={0} className="lg:col-span-2">
          <PanelTitle hint="the differentiator">Why the effect-size gate exists</PanelTitle>
          <p className="text-sm leading-relaxed text-muted">
            With {manifest.data?.n_segments.toLocaleString() ?? "~6k"} segments, a p-value
            proves almost nothing: every one of the {significance.data?.length ?? 36}{" "}
            extracted features clears p &lt; 0.05, several at p ≈ 0. Sample size alone makes
            trivial differences &ldquo;significant&rdquo;, so a p-only filter would wave
            everything through and justify none of it.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Eta-squared asks a harder question — how much of a feature&rsquo;s variance the
            fault class actually explains — and it does not inflate with sample size.{" "}
            <span className="text-bone">
              wv_detail_5_std is the clearest case: p = 5.7 × 10⁻¹²⁸, yet η² = 0.03.
            </span>{" "}
            Overwhelmingly significant, and nearly useless. It does not pass.
          </p>
          <Link
            href="/significance"
            className="mt-5 inline-block text-xs text-crimson transition-opacity duration-200 hover:opacity-70"
          >
            See the full table →
          </Link>
        </Panel>

        <Panel index={1}>
          <PanelTitle>Pipeline</PanelTitle>
          <ol className="space-y-3.5 text-sm">
            {[
              "Segment raw vibration",
              "Extract time / FFT / wavelet",
              "Gate on effect size",
              "Benchmark 6 algorithms",
              "Cluster without labels",
            ].map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="font-[family-name:var(--font-mono)] text-xs text-crimson">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-muted">{step}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROUTES.map((r, i) => (
          <motion.div key={r.href} {...stagger(i)}>
            <Link
              href={r.href}
              className="group block h-full rounded-lg border border-line bg-surface p-5 transition-colors duration-200 hover:border-taupe"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-bone">{r.title}</h3>
                <span className="text-muted transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-crimson">
                  →
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{r.body}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </>
  );
}
