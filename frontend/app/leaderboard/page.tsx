"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, CLASS_LABEL, fmtPct, type LeaderboardRow } from "@/lib/api";
import { ENTER, ErrorNote, Panel, PanelTitle, PageHeader, Skeleton } from "@/components/ui";

function ConfusionMatrix({ row }: { row: LeaderboardRow }) {
  const max = Math.max(...row.confusion_matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="p-2" />
            {row.class_order.map((c) => (
              <th key={c} className="p-2 text-center font-normal text-muted">
                {CLASS_LABEL[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row.confusion_matrix.map((r, i) => (
            <tr key={i}>
              <th className="whitespace-nowrap p-2 text-right font-normal text-muted">
                {CLASS_LABEL[row.class_order[i]] ?? row.class_order[i]}
              </th>
              {r.map((v, j) => {
                const correct = i === j;
                // Intensity encodes count; crimson marks misclassification,
                // bone marks correct — so errors are what the eye finds first.
                const alpha = max ? v / max : 0;
                return (
                  <td
                    key={j}
                    title={`${v} ${row.class_order[i]} predicted as ${row.class_order[j]}`}
                    className="tabular h-11 w-16 rounded text-center"
                    style={{
                      background: v
                        ? correct
                          ? `color-mix(in oklab, var(--color-bone) ${alpha * 22}%, var(--color-surface-2))`
                          : `color-mix(in oklab, var(--color-crimson) ${Math.max(alpha * 100, 28)}%, var(--color-surface-2))`
                        : "var(--color-surface-2)",
                      color: v && !correct ? "var(--color-bone)" : v ? "var(--color-bone)" : "#3a3639",
                    }}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Rows: actual · Columns: predicted</p>
    </div>
  );
}

export default function Leaderboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["leaderboard"], queryFn: api.leaderboard });
  const [selected, setSelected] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;

  const chart = data?.map((r) => ({
    name: r.model_name.replace(" (MLP)", "").replace("k-Nearest Neighbors", "k-NN"),
    cv: r.cv_mean * 100,
    full: r.model_name,
  }));
  // Floor tracks the data so a retrain with a weaker model never clips a bar.
  const yFloor = chart ? Math.max(0, Math.floor(Math.min(...chart.map((c) => c.cv)) / 5) * 5 - 5) : 80;
  const active = data?.find((r) => r.model_name === selected);

  return (
    <>
      <PageHeader eyebrow="Benchmark" title="Model leaderboard">
        Six algorithms, one seeded split, identical gated features. Ranked by{" "}
        <span className="text-bone">cross-validated mean</span>, not single-holdout accuracy —
        the holdout is only ~8 recordings, and an easy draw hands a weaker model a perfect
        score. The CV column is the number worth trusting.
      </PageHeader>

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[280px]" />
        </div>
      ) : (
        <>
          <Panel index={0} className="mb-3">
            <PanelTitle hint="grouped 5-fold cross-validation">Accuracy</PanelTitle>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke="var(--color-line)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--color-line)" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[yFloor, 100]}
                    tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: "var(--color-surface-2)" }}
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-line)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--color-bone)" }}
                    formatter={(v) => [`${Number(v).toFixed(2)}%`, "CV accuracy"]}
                  />
                  <Bar dataKey="cv" radius={[3, 3, 0, 0]} animationDuration={550}>
                    {chart?.map((entry, i) => (
                      <Cell
                        key={entry.full}
                        fill={i === 0 ? "var(--color-crimson)" : "var(--color-taupe)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted">
              Y-axis starts at {yFloor}% to make the spread legible — the full range is
              0–100%.
            </p>
          </Panel>

          <Panel index={1}>
            <PanelTitle hint="select a row for its confusion matrix">Metrics</PanelTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="pb-3 font-normal">Model</th>
                    <th className="pb-3 text-right font-normal">CV mean ± σ</th>
                    <th className="pb-3 text-right font-normal">Holdout</th>
                    <th className="pb-3 text-right font-normal">Macro F1</th>
                    <th className="pb-3 text-right font-normal">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.map((r) => {
                    const isOpen = selected === r.model_name;
                    return (
                      <tr
                        key={r.model_name}
                        onClick={() => setSelected(isOpen ? null : r.model_name)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(isOpen ? null : r.model_name);
                          }
                        }}
                        className={`cursor-pointer border-b border-line/60 transition-colors duration-200 hover:bg-surface-2 ${
                          isOpen ? "bg-surface-2" : ""
                        }`}
                      >
                        <td className="py-3.5">
                          <span className={isOpen ? "text-crimson" : "text-bone"}>
                            {r.model_name}
                          </span>
                        </td>
                        <td className="tabular py-3.5 text-right font-[family-name:var(--font-mono)] text-bone">
                          {fmtPct(r.cv_mean)}{" "}
                          <span className="text-muted">± {(r.cv_std * 100).toFixed(2)}</span>
                        </td>
                        <td className="tabular py-3.5 text-right font-[family-name:var(--font-mono)] text-muted">
                          {fmtPct(r.accuracy)}
                        </td>
                        <td className="tabular py-3.5 text-right font-[family-name:var(--font-mono)] text-muted">
                          {fmtPct(r.macro_f1)}
                        </td>
                        <td className="tabular py-3.5 text-right font-[family-name:var(--font-mono)] text-muted">
                          {r.inference_latency_ms.toFixed(2)}ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <AnimatePresence mode="wait">
              {active && (
                <motion.div
                  key={active.model_name}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 grid gap-8 border-t border-line pt-6 lg:grid-cols-2">
                    <div>
                      <h3 className="mb-4 text-xs uppercase tracking-wider text-muted">
                        {active.model_name} — confusion matrix
                      </h3>
                      <ConfusionMatrix row={active} />
                    </div>
                    <div>
                      <h3 className="mb-4 text-xs uppercase tracking-wider text-muted">
                        Per-class
                      </h3>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted">
                            <th className="pb-2 font-normal">Class</th>
                            <th className="pb-2 text-right font-normal">Prec.</th>
                            <th className="pb-2 text-right font-normal">Recall</th>
                            <th className="pb-2 text-right font-normal">F1</th>
                            <th className="pb-2 text-right font-normal">n</th>
                          </tr>
                        </thead>
                        <tbody className="font-[family-name:var(--font-mono)]">
                          {Object.entries(active.per_class).map(([cls, m]) => (
                            <tr key={cls} className="border-t border-line/50">
                              <td className="py-2 font-[family-name:var(--font-inter)] text-bone">
                                {CLASS_LABEL[cls] ?? cls}
                              </td>
                              <td className="tabular py-2 text-right text-muted">
                                {m.precision.toFixed(3)}
                              </td>
                              <td className="tabular py-2 text-right text-muted">
                                {m.recall.toFixed(3)}
                              </td>
                              <td className="tabular py-2 text-right text-bone">
                                {m.f1.toFixed(3)}
                              </td>
                              <td className="tabular py-2 text-right text-muted">{m.support}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>

          <motion.p {...ENTER} className="mt-6 max-w-3xl text-xs leading-relaxed text-muted">
            Naive Bayes sits last by design, not by accident: it assumes features are
            conditionally independent, and vibration features are strongly correlated —
            spectral centroid, rolloff and band energies all move together. The spread from
            Naive Bayes to Random Forest is what makes this a benchmark rather than a
            formality.
          </motion.p>
        </>
      )}
    </>
  );
}
