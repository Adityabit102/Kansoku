"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import * as d3 from "d3";
import { api, CLASS_COLOR, CLASS_LABEL, type ClusterPoint } from "@/lib/api";
import { ENTER, ErrorNote, PageHeader, Panel, PanelTitle, Skeleton, Stat } from "@/components/ui";

type ColorMode = "cluster" | "label" | "severity";

/** Categorical ramp for discovered clusters: taupe→bone→crimson family, no hues
 *  outside the palette. */
const CLUSTER_COLORS = [
  "#e70f0e", "#e1decc", "#8d8779", "#c2452f", "#5c545b",
  "#a8503c", "#b5ae9d", "#742b21", "#474145", "#d98a7a", "#63594f", "#932e1a",
];

const SEVERITY_COLOR: Record<string, string> = {
  "0": "#e1decc",
  "0.007": "#8d8779",
  "0.014": "#c2452f",
  "0.021": "#e70f0e",
};

function pointColor(p: ClusterPoint, mode: ColorMode): string {
  if (mode === "cluster") return CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length];
  if (mode === "label") return CLASS_COLOR[p.true_label];
  return SEVERITY_COLOR[String(p.severity)] ?? "#8d8779";
}

function Scatter({ points, mode }: { points: ClusterPoint[]; mode: ColorMode }) {
  const ref = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; p: ClusterPoint } | null>(null);

  useEffect(() => {
    const svg = d3.select(ref.current);
    if (!ref.current) return;
    const { width } = ref.current.getBoundingClientRect();
    const height = 460;
    const margin = 28;

    const x = d3
      .scaleLinear()
      .domain(d3.extent(points, (d) => d.pc1) as [number, number])
      .nice()
      .range([margin, width - margin]);
    const y = d3
      .scaleLinear()
      .domain(d3.extent(points, (d) => d.pc2) as [number, number])
      .nice()
      .range([height - margin, margin]);

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Faint grid, no axis chrome — the axes are PCA components, and their
    // absolute values carry no physical meaning worth labelling heavily.
    const grid = svg.append("g").attr("stroke", "var(--color-line)").attr("stroke-opacity", 0.5);
    x.ticks(6).forEach((t) =>
      grid.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", margin).attr("y2", height - margin),
    );
    y.ticks(6).forEach((t) =>
      grid.append("line").attr("y1", y(t)).attr("y2", y(t)).attr("x1", margin).attr("x2", width - margin),
    );

    svg
      .append("g")
      .selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (d) => x(d.pc1))
      .attr("cy", (d) => y(d.pc2))
      .attr("r", 2.4)
      .attr("fill", (d) => pointColor(d, mode))
      .attr("fill-opacity", 0.65)
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("r", 4.5).attr("fill-opacity", 1);
        const [mx, my] = d3.pointer(event, ref.current);
        setTip({ x: mx, y: my, p: d });
      })
      .on("mouseleave", function () {
        d3.select(this).attr("r", 2.4).attr("fill-opacity", 0.65);
        setTip(null);
      });
  }, [points, mode]);

  return (
    <div className="relative">
      <svg ref={ref} className="h-[460px] w-full" role="img" aria-label="PCA projection of segments" />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 rounded border border-line bg-black/95 px-3 py-2 text-xs"
          style={{ left: `min(${tip.x + 12}px, calc(100% - 200px))`, top: tip.y - 8 }}
        >
          <p className="font-[family-name:var(--font-mono)] text-bone">{tip.p.segment_id}</p>
          <p className="mt-1 text-muted">
            cluster {tip.p.cluster} · {CLASS_LABEL[tip.p.true_label]}
            {tip.p.severity > 0 && ` · ${tip.p.severity}″`} · {tip.p.load_hp} hp
          </p>
        </div>
      )}
    </div>
  );
}

function SilhouetteSweep({
  sweep,
  chosen,
}: {
  sweep: { k: number; inertia: number; silhouette: number }[];
  chosen: number;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    const { width } = ref.current.getBoundingClientRect();
    const height = 190;
    const m = { top: 12, right: 44, bottom: 26, left: 44 };

    const x = d3.scalePoint<number>().domain(sweep.map((s) => s.k)).range([m.left, width - m.right]);
    const ySil = d3
      .scaleLinear()
      .domain([0, (d3.max(sweep, (s) => s.silhouette) ?? 1) * 1.15])
      .range([height - m.bottom, m.top]);
    const yIn = d3
      .scaleLinear()
      .domain([0, d3.max(sweep, (s) => s.inertia) ?? 1])
      .range([height - m.bottom, m.top]);

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Inertia (elbow) in taupe, silhouette in crimson; chosen k gets a marker.
    const lineIn = d3
      .line<(typeof sweep)[number]>()
      .x((s) => x(s.k)!)
      .y((s) => yIn(s.inertia))
      .curve(d3.curveMonotoneX);
    const lineSil = d3
      .line<(typeof sweep)[number]>()
      .x((s) => x(s.k)!)
      .y((s) => ySil(s.silhouette))
      .curve(d3.curveMonotoneX);

    svg.append("path").datum(sweep).attr("d", lineIn).attr("fill", "none")
      .attr("stroke", "var(--color-taupe)").attr("stroke-width", 1.5);
    const silPath = svg.append("path").datum(sweep).attr("d", lineSil).attr("fill", "none")
      .attr("stroke", "var(--color-crimson)").attr("stroke-width", 1.8);

    // Draw-in on first paint only; 500ms, ease-out.
    const len = (silPath.node() as SVGPathElement).getTotalLength();
    silPath
      .attr("stroke-dasharray", `${len} ${len}`)
      .attr("stroke-dashoffset", len)
      .transition()
      .duration(500)
      .ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);

    const chosenPt = sweep.find((s) => s.k === chosen)!;
    svg.append("circle")
      .attr("cx", x(chosen)!).attr("cy", ySil(chosenPt.silhouette)).attr("r", 4)
      .attr("fill", "var(--color-crimson)");
    svg.append("text")
      .attr("x", x(chosen)!).attr("y", ySil(chosenPt.silhouette) - 10)
      .attr("text-anchor", "middle").attr("fill", "var(--color-bone)")
      .attr("font-size", 11).attr("font-family", "var(--font-mono)")
      .text(`k=${chosen}`);

    const axis = svg.append("g").attr("font-size", 10).attr("fill", "var(--color-muted)");
    sweep.forEach((s) =>
      axis.append("text").attr("x", x(s.k)!).attr("y", height - 8).attr("text-anchor", "middle").text(s.k),
    );
  }, [sweep, chosen]);

  return <svg ref={ref} className="h-[190px] w-full" role="img" aria-label="Silhouette and elbow sweep" />;
}

export default function Clusters() {
  const { data, isLoading, error } = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const [mode, setMode] = useState<ColorMode>("cluster");

  const legend = useMemo(() => {
    if (!data) return [];
    if (mode === "cluster")
      return Array.from({ length: data.chosen_k }, (_, i) => ({
        label: `C${i}`,
        color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      }));
    if (mode === "label")
      return Object.entries(CLASS_LABEL).map(([k, label]) => ({ label, color: CLASS_COLOR[k] }));
    return Object.entries(SEVERITY_COLOR).map(([sev, color]) => ({
      label: sev === "0" ? "healthy" : `${sev}″`,
      color,
    }));
  }, [data, mode]);

  if (error) return <ErrorNote error={error} />;

  return (
    <>
      <PageHeader eyebrow="Unsupervised discovery" title="Cluster explorer">
        K-means ran on the gated feature space with{" "}
        <span className="text-bone">no access to labels</span>, and peak silhouette chose
        k = {data?.chosen_k ?? "…"} — more than the 4 labeled classes. Switch the coloring
        below and the story appears: the extra clusters are{" "}
        <span className="text-bone">fault severity</span>, a physical dimension the labels
        never encoded.
      </PageHeader>

      {isLoading || !data ? (
        <Skeleton className="h-[560px]" />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat index={0} label="Clusters found" value={`${data.chosen_k}`} sub="peak silhouette" accent />
            <Stat index={1} label="Labeled classes" value="4" sub="in training data" />
            <Stat
              index={2}
              label="Silhouette"
              value={Math.max(...data.sweep.map((s) => s.silhouette)).toFixed(3)}
              sub={`best of k ∈ [${data.sweep[0].k}, ${data.sweep[data.sweep.length - 1].k}]`}
            />
            <Stat
              index={3}
              label="PCA variance"
              value={`${(data.explained_variance.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%`}
              sub="held by 3 components"
            />
          </div>

          <Panel index={1} className="mb-3">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-sm font-medium text-bone">
                PCA projection <span className="text-muted">· PC1 × PC2</span>
              </h2>
              <div className="flex gap-1" role="group" aria-label="Color points by">
                {(["cluster", "label", "severity"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`rounded-full border px-3 py-1 text-[11px] capitalize transition-colors duration-200 ${
                      mode === m
                        ? "border-crimson/50 bg-crimson/10 text-bone"
                        : "border-line text-muted hover:border-taupe hover:text-bone"
                    }`}
                  >
                    by {m}
                  </button>
                ))}
              </div>
            </div>
            <Scatter points={data.points} mode={mode} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {legend.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel index={2}>
              <PanelTitle hint="crimson: silhouette · taupe: inertia">
                Why k = {data.chosen_k}
              </PanelTitle>
              <SilhouetteSweep sweep={data.sweep} chosen={data.chosen_k} />
              <p className="mt-2 text-xs leading-relaxed text-muted">
                The elbow flattens after k ≈ 6 while silhouette keeps rising to its peak at
                k = {data.chosen_k} — the sweep is shown, not asserted.
              </p>
            </Panel>

            <Panel index={3}>
              <PanelTitle>What the extra clusters are</PanelTitle>
              <p className="text-sm leading-relaxed text-muted">
                Colored by severity, inner-race and outer-race faults each split cleanly
                into their three fault diameters (0.007″ / 0.014″ / 0.021″) — distinctions
                the model was never told about. Healthy segments collapse into a single
                cluster.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Ball faults refuse to split by severity, and that is physically sensible: a
                rotating ball spreads its impact energy across both races, blurring the
                severity signature that point defects on a fixed race preserve. Motor load,
                notably, separates nothing.
              </p>
            </Panel>
          </div>

          <motion.p {...ENTER} className="mt-6 text-xs text-muted">
            Per-cluster label purity ranges 0.88–1.00 · every point is one 2048-sample
            segment · hover any point for its identity.
          </motion.p>
        </>
      )}
    </>
  );
}
