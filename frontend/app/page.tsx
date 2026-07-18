"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api, fmtPct } from "@/lib/api";
import { MachineLanding } from "@/components/MachineLanding";
import { Welcome } from "@/components/Welcome";
import { DotGrid } from "@/components/DotGrid";
import { LiveTelemetry } from "@/components/LiveTelemetry";
import {
  EASE,
  ErrorNote,
  Panel,
  PanelTitle,
  Skeleton,
  Stat,
  TiltCard,
  stagger,
} from "@/components/ui";

const ROUTES = [
  { href: "/signals", title: "Signals", body: "Waveforms and FFT spectra with BPFI/BPFO/BSF overlays." },
  { href: "/significance", title: "Significance", body: "Which features earn their place, and why." },
  { href: "/clusters", title: "Clusters", body: "Nine regimes, unlabeled, in rotating 3D." },
  { href: "/leaderboard", title: "Leaderboard", body: "Six algorithms, one split, ranked honestly." },
  { href: "/predict", title: "Diagnose", body: "Upload a recording — any model can serve." },
  { href: "#telemetry", title: "Live telemetry", body: "Simulated feed with real windowed RMS / kurtosis." },
];

export default function Overview() {
  const [, setEntered] = useState(false);
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
      <Welcome onDone={() => setEntered(true)} />

      <MachineLanding />

      {/* Below the acts: the live sections, in the approved order, above the
          machine's watermark. */}
      <div className="relative z-[2]">
        <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
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

        <div className="mb-10 grid items-stretch gap-3 lg:grid-cols-[1fr_440px]">
          <Panel index={0}>
            <PanelTitle hint="the differentiator">Why the effect-size gate exists</PanelTitle>
            <p className="text-sm leading-relaxed text-muted">
              With {manifest.data?.n_segments.toLocaleString() ?? "~6k"} segments, a p-value
              proves almost nothing: every one of the {significance.data?.length ?? 36}{" "}
              extracted features clears p &lt; 0.05, several at p ≈ 0. Sample size alone
              makes trivial differences &ldquo;significant&rdquo;, so a p-only filter would
              wave everything through and justify none of it.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Eta-squared asks a harder question — how much of a feature&rsquo;s variance
              the fault class actually explains — and it does not inflate with sample size.{" "}
              <span className="text-ink">
                wv_detail_5_std is the clearest case: p = 5.7 × 10⁻¹²⁸, yet η² = 0.03.
              </span>{" "}
              Overwhelmingly significant, and nearly useless. It does not pass.
            </p>
            <Link
              href="/significance"
              className="mt-5 inline-block text-xs text-accent transition-opacity duration-200 hover:opacity-70"
            >
              See the full table →
            </Link>
          </Panel>
          <motion.div
            id="telemetry"
            initial={{ opacity: 0, x: 24, rotateY: -8, transformPerspective: 1000 }}
            whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="scroll-mt-24"
          >
            <LiveTelemetry />
          </motion.div>
        </div>

        <div className="mb-10 grid gap-3 lg:grid-cols-3">
          <Panel index={0} className="lg:col-span-2">
            <PanelTitle>Pipeline</PanelTitle>
            <ol className="space-y-3.5 text-sm">
              {[
                "Segment raw vibration",
                "Extract time / FFT / wavelet features",
                "Gate on effect size",
                "Benchmark 6 algorithms on grouped splits",
                "Cluster without labels",
              ].map((step, i) => (
                <motion.li
                  key={step}
                  className="flex gap-3"
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, ease: EASE, delay: i * 0.08 }}
                >
                  <span className="font-[family-name:var(--font-mono)] text-xs text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-muted">{step}</span>
                </motion.li>
              ))}
            </ol>
          </Panel>

          <Panel index={1}>
            <PanelTitle>The data</PanelTitle>
            <p className="text-sm leading-relaxed text-muted">
              CWRU Bearing Dataset: 40 recordings from a 2&nbsp;hp test rig — four classes
              (healthy, inner race, outer race, ball) at three fault diameters and four
              motor loads, sampled at 12&nbsp;kHz on the drive end.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Splits are grouped by recording, so overlapping windows of one capture can
              never sit on both sides of train and test.
            </p>
          </Panel>
        </div>

        <DotGrid />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROUTES.map((r, i) => (
            <motion.div key={r.href} {...stagger(i)} className="h-full">
              <TiltCard className="h-full">
                <Link
                  href={r.href}
                  className="plate group block h-full rounded-xl border border-line bg-surface p-5 transition-colors duration-200 hover:border-accent/40"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-ink">{r.title}</h3>
                    <span className="text-muted transition-transform duration-200 ease-out group-hover:translate-x-1 group-hover:text-accent">
                      →
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{r.body}</p>
                </Link>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </>
  );
}
