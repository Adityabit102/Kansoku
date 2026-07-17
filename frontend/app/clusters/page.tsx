"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import * as d3 from "d3";
import { api, CLASS_COLOR, CLASS_LABEL, type ClusterPoint } from "@/lib/api";
import { ENTER, ErrorNote, PageHeader, Panel, PanelTitle, Skeleton, Stat } from "@/components/ui";

type ColorMode = "cluster" | "label" | "severity";

/** Identity colors for discovered clusters: the eight light-mode categorical
 *  slots of the validated default palette, in fixed order, plus a neutral for
 *  the ninth. Nine series in a scatter exceeds what any palette can make
 *  all-pairs CVD-safe, so identity leans on the required secondary encoding:
 *  the legend, per-point tooltips, and the composition panel. */
const CLUSTER_COLORS = [
  "#2a78d6", "#008300", "#e87ba4", "#eda100",
  "#1baf7a", "#eb6834", "#4a3aa7", "#e34948", "#8a8374",
];

/** Ordinal ramp: severity is ordered, so one hue, monotonic lightness (the
 *  default blue sequential, light-mode steps). Healthy is a neutral state,
 *  not a rung on the ramp. */
const SEVERITY_COLOR: Record<string, string> = {
  "0": "#8a8374",
  "0.007": "#6da7ec",
  "0.014": "#2a78d6",
  "0.021": "#184f95",
};

function pointColor(p: ClusterPoint, mode: ColorMode): string {
  if (mode === "cluster") return CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length];
  if (mode === "label") return CLASS_COLOR[p.true_label];
  return SEVERITY_COLOR[String(p.severity)] ?? "#8a8374";
}

/** 3D PCA scatter on canvas: slow auto-rotation around the vertical axis,
 *  drag to rotate, hover to identify. The third principal component has been
 *  computed all along — this view finally spends it. Depth is encoded with
 *  size and opacity; reduced-motion users get a static view they can drag. */
function Scatter3D({ points, mode }: { points: ClusterPoint[]; mode: ColorMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; p: ClusterPoint } | null>(null);
  const theta = useRef(0.35);
  const phi = useRef(0.42); // fixed downward tilt, adjustable by vertical drag
  const dragging = useRef(false);
  const autoRotate = useRef(true);
  const mouse = useRef<{ x: number; y: number } | null>(null);

  // Normalize once: center and scale each axis to [-1, 1].
  const normalized = useMemo(() => {
    const ext = (k: "pc1" | "pc2" | "pc3") => {
      const [lo, hi] = d3.extent(points, (p) => p[k]) as [number, number];
      const mid = (lo + hi) / 2, half = (hi - lo) / 2 || 1;
      return (v: number) => (v - mid) / half;
    };
    const nx = ext("pc1"), ny = ext("pc2"), nz = ext("pc3");
    return points.map((p) => ({ p, x: nx(p.pc1), y: ny(p.pc2), z: nz(p.pc3) }));
  }, [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const resize = () => {
      const { width } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = 480 * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const colors = normalized.map(({ p }) => pointColor(p, mode));

    const draw = () => {
      if (autoRotate.current && !dragging.current && !reduced) theta.current += 0.0035;

      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const scale = Math.min(W, H) * 0.36;
      const ct = Math.cos(theta.current), st = Math.sin(theta.current);
      const cp = Math.cos(phi.current), sp = Math.sin(phi.current);

      // Project, then paint back-to-front so nearer points overdraw farther.
      const projected = normalized.map(({ p, x, y, z }, i) => {
        const rx = x * ct + z * st;
        const rz = -x * st + z * ct;
        const ry = y * cp - rz * sp;
        const depth = y * sp + rz * cp; // toward viewer
        const persp = 1 / (1.9 - depth * 0.55);
        return { p, i, sx: cx + rx * scale * persp, sy: cy - ry * scale * persp, depth };
      });
      projected.sort((a, b) => a.depth - b.depth);

      for (const q of projected) {
        const t = (q.depth + 1) / 2; // 0 far → 1 near
        ctx.globalAlpha = 0.25 + t * 0.6;
        ctx.fillStyle = colors[q.i];
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, (1.1 + t * 1.9) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Hover picking: nearest projected point within 10px, favoring nearer ones.
      if (mouse.current) {
        const mx = mouse.current.x * dpr, my = mouse.current.y * dpr;
        let best: (typeof projected)[number] | null = null;
        let bestD = (10 * dpr) ** 2;
        for (const q of projected) {
          const d = (q.sx - mx) ** 2 + (q.sy - my) ** 2;
          if (d < bestD) { bestD = d; best = q; }
        }
        if (best) {
          ctx.strokeStyle = "#2b2724";
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath();
          ctx.arc(best.sx, best.sy, 5 * dpr, 0, Math.PI * 2);
          ctx.stroke();
          setTip({ x: best.sx / dpr, y: best.sy / dpr, p: best.p });
        } else setTip(null);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [normalized, mode]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    autoRotate.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (dragging.current) {
      theta.current += e.movementX * 0.006;
      phi.current = Math.max(-1.2, Math.min(1.2, phi.current + e.movementY * 0.004));
    }
  }, []);
  const onPointerUp = useCallback(() => { dragging.current = false; }, []);
  const onPointerLeave = useCallback(() => {
    dragging.current = false;
    mouse.current = null;
    setTip(null);
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-[480px] w-full cursor-grab touch-none active:cursor-grabbing"
        role="img"
        aria-label="Rotating 3D PCA projection of segments; drag to rotate"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={() => { autoRotate.current = true; }}
      />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 rounded border border-line bg-surface/95 px-3 py-2 text-xs plate"
          style={{ left: `min(${tip.x + 14}px, calc(100% - 200px))`, top: tip.y - 8 }}
        >
          <p className="font-[family-name:var(--font-mono)] text-ink">{tip.p.segment_id}</p>
          <p className="mt-1 text-muted">
            cluster {tip.p.cluster} · {CLASS_LABEL[tip.p.true_label]}
            {tip.p.severity > 0 && ` · ${tip.p.severity}″`} · {tip.p.load_hp} hp
          </p>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-muted">
        drag to rotate · double-click to resume spin
      </p>
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

    // Inertia (elbow) recedes in tan; silhouette carries the story in red.
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
      .attr("stroke", "var(--color-tan)").attr("stroke-width", 1.5);
    const silPath = svg.append("path").datum(sweep).attr("d", lineSil).attr("fill", "none")
      .attr("stroke", "var(--color-accent)").attr("stroke-width", 1.8);

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
      .attr("fill", "var(--color-accent)");
    svg.append("text")
      .attr("x", x(chosen)!).attr("y", ySil(chosenPt.silhouette) - 10)
      .attr("text-anchor", "middle").attr("fill", "var(--color-ink)")
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
        <span className="text-ink">no access to labels</span>, and peak silhouette chose
        k = {data?.chosen_k ?? "…"} — more than the 4 labeled classes. Rotate the
        projection and switch the coloring: the extra clusters are{" "}
        <span className="text-ink">fault severity</span>, a physical dimension the labels
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
              <h2 className="text-sm font-medium text-ink">
                PCA projection <span className="text-muted">· PC1 × PC2 × PC3</span>
              </h2>
              <div className="flex gap-1" role="group" aria-label="Color points by">
                {(["cluster", "label", "severity"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`rounded-full border px-3 py-1 text-[11px] capitalize transition-colors duration-200 ${
                      mode === m
                        ? "border-accent/50 bg-accent/10 text-ink"
                        : "border-line text-muted hover:border-accent/50 hover:text-ink"
                    }`}
                  >
                    by {m}
                  </button>
                ))}
              </div>
            </div>
            <Scatter3D points={data.points} mode={mode} />
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
              <PanelTitle hint="red: silhouette · tan: inertia">
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
