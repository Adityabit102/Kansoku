"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { api, CLASS_LABEL, fmtPct, type PredictionResponse } from "@/lib/api";
import { PageHeader, Panel, PanelTitle } from "@/components/ui";

function ProbabilityRow({ cls, p, isTop }: { cls: string; p: number; isTop: boolean }) {
  const topColor = cls === "healthy" ? "var(--color-teal-bright)" : "var(--color-ember-bright)";
  return (
    <div className="flex items-center gap-3">
      <span className={`w-24 shrink-0 text-xs ${isTop ? "text-sand" : "text-muted"}`}>
        {CLASS_LABEL[cls] ?? cls}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: p }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={{
            transformOrigin: "left",
            background: isTop ? topColor : "var(--color-line)",
          }}
          className="h-full w-full"
        />
      </div>
      <span className="tabular w-16 shrink-0 text-right font-[family-name:var(--font-mono)] text-xs text-sand">
        {fmtPct(p)}
      </span>
    </div>
  );
}

function Result({ result }: { result: PredictionResponse }) {
  const isHealthy = result.predicted_class === "healthy";
  const probs = Object.entries(result.class_probabilities).sort(([, a], [, b]) => b - a);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="grid gap-3 lg:grid-cols-2"
    >
      <Panel index={0}>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Diagnosis</p>
        <p
          className={`mt-2 text-4xl font-semibold tracking-tight ${
            isHealthy ? "text-teal-bright" : "text-ember-bright"
          }`}
        >
          {CLASS_LABEL[result.predicted_class]}
        </p>
        <p className="mt-1.5 text-sm text-muted">
          {fmtPct(result.confidence, 1)} confidence · {result.model_name} v
          {result.model_version} · {result.latency_ms.toFixed(0)}ms
        </p>

        <div className="mt-6 space-y-2.5">
          {probs.map(([cls, p]) => (
            <ProbabilityRow key={cls} cls={cls} p={p} isTop={cls === result.predicted_class} />
          ))}
        </div>
      </Panel>

      <Panel index={1}>
        <PanelTitle hint="deviation × effect size, top 6">What drove this</PanelTitle>
        <div className="space-y-3">
          {result.driving_features.map((f) => (
            <div key={f.name} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-[family-name:var(--font-mono)] text-xs text-sand">
                  {f.name}
                </p>
                <p className="text-[11px] text-muted">
                  value {f.value.toPrecision(3)} · η² {f.eta_squared.toFixed(2)}
                </p>
              </div>
              <span className="tabular shrink-0 font-[family-name:var(--font-mono)] text-xs text-muted">
                {fmtPct(f.contribution, 0)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          Only features that passed the statistical gate can appear here — each is weighted
          by how far this signal deviates from the training distribution times how much
          class information the feature is known to carry.
        </p>
      </Panel>
    </motion.div>
  );
}

/** Bundled CWRU recordings with known ground truth, so a visitor can test the
 *  model in one click and check its answer against the label. */
const DEMOS = [
  { id: "97", label: "Healthy baseline", truth: "healthy" },
  { id: "105", label: "Inner race, 0.007″", truth: "inner_race" },
  { id: "118", label: "Ball, 0.007″", truth: "ball" },
  { id: "234", label: "Outer race, 0.021″", truth: "outer_race" },
] as const;

export default function Predict() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pendingDemo, setPendingDemo] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: File | string) =>
      typeof input === "string" ? api.predictDemo(input) : api.predict(input),
    onSettled: () => setPendingDemo(null),
  });

  const submit = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setFileName(file.name);
      mutation.mutate(file);
    },
    [mutation],
  );

  const runDemo = useCallback(
    (demo: (typeof DEMOS)[number]) => {
      setFileName(`${demo.id}.mat`);
      setPendingDemo(demo.id);
      mutation.mutate(demo.id);
    },
    [mutation],
  );

  return (
    <>
      <PageHeader eyebrow="Inference" title="Diagnose a signal">
        Upload a raw vibration capture — a CWRU-format <span className="text-sand">.mat</span>{" "}
        or a single-column <span className="text-sand">.csv</span> of accelerometer samples
        (≥ 2048 values at 12 kHz). Longer captures are segmented and majority-voted, the way
        a deployment would treat a continuous recording.
      </PageHeader>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="mb-3"
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            submit(e.dataTransfer.files[0]);
          }}
          disabled={mutation.isPending}
          className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 transition-colors duration-200 ${
            dragging
              ? "border-teal-bright/70 bg-teal/10"
              : "border-line bg-surface hover:border-teal/60"
          } ${mutation.isPending ? "cursor-wait opacity-60" : "cursor-pointer"}`}
        >
          <span className="text-2xl text-teal-bright">{mutation.isPending ? "…" : "⌾"}</span>
          <span className="mt-3 text-sm text-sand">
            {mutation.isPending
              ? `Analyzing ${fileName ?? "signal"}`
              : "Drop a signal file, or click to browse"}
          </span>
          <span className="mt-1 text-xs text-muted">.mat (CWRU format) or .csv · ≥ 2048 samples</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mat,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            submit(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">No file on hand? Diagnose a bundled recording:</span>
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              onClick={() => runDemo(demo)}
              disabled={mutation.isPending}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors duration-200 ${
                pendingDemo === demo.id
                  ? "border-teal-bright/60 bg-teal/20 text-sand"
                  : "border-line text-muted hover:border-teal/60 hover:text-sand"
              } ${mutation.isPending ? "cursor-wait opacity-60" : ""}`}
            >
              {demo.label}
            </button>
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {mutation.isError && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-3 rounded-lg border border-ember-bright/40 bg-ember/15 p-4"
          >
            <p className="text-sm text-sand">Could not diagnose this file</p>
            <p className="mt-1 text-xs text-muted">{(mutation.error as Error).message}</p>
          </motion.div>
        )}
        {mutation.isSuccess && <Result key={fileName} result={mutation.data} />}
      </AnimatePresence>

      {!mutation.isSuccess && !mutation.isError && (
        <p className="mt-4 text-xs text-muted">
          The demo recordings above carry known ground truth — the diagnosis can be checked
          against the label on the button.
        </p>
      )}
    </>
  );
}
