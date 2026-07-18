"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as d3 from "d3";
import { api, CLASS_LABEL, type SegmentRef } from "@/lib/api";
import { ErrorNote, PageHeader, Panel, PanelTitle, Skeleton } from "@/components/ui";

interface Marker {
  x: number;
  label: string;
  color: string;
}

function LinePlot({
  xs,
  ys,
  height = 240,
  xLabel,
  yLabel,
  color = "var(--color-ink)",
  animate = true,
  markers = [],
}: {
  xs: number[];
  ys: number[];
  height?: number;
  xLabel: string;
  yLabel: string;
  color?: string;
  animate?: boolean;
  markers?: Marker[];
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || xs.length === 0) return;
    const svg = d3.select(ref.current);
    const { width } = ref.current.getBoundingClientRect();
    const m = { top: 10, right: 12, bottom: 34, left: 52 };

    const x = d3.scaleLinear().domain(d3.extent(xs) as [number, number]).range([m.left, width - m.right]);
    const y = d3
      .scaleLinear()
      .domain(d3.extent(ys) as [number, number])
      .nice()
      .range([height - m.bottom, m.top]);

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const axisColor = "var(--color-muted)";
    const xAxis = svg
      .append("g")
      .attr("transform", `translate(0,${height - m.bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
    const yAxis = svg
      .append("g")
      .attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
    for (const ax of [xAxis, yAxis]) {
      ax.selectAll("text").attr("fill", axisColor).attr("font-size", 10);
      ax.selectAll("line").attr("stroke", "var(--color-line)");
      ax.select(".domain").attr("stroke", "var(--color-line)");
    }

    svg
      .append("text")
      .attr("x", width / 2).attr("y", height - 4)
      .attr("text-anchor", "middle").attr("fill", axisColor).attr("font-size", 10)
      .text(xLabel);
    svg
      .append("text")
      .attr("transform", `rotate(-90)`)
      .attr("x", -height / 2).attr("y", 14)
      .attr("text-anchor", "middle").attr("fill", axisColor).attr("font-size", 10)
      .text(yLabel);

    // Characteristic fault frequencies as dashed verticals behind the trace.
    for (const mk of markers) {
      if (mk.x < xs[0] || mk.x > xs[xs.length - 1]) continue;
      svg
        .append("line")
        .attr("x1", x(mk.x)).attr("x2", x(mk.x))
        .attr("y1", m.top).attr("y2", height - m.bottom)
        .attr("stroke", mk.color)
        .attr("stroke-dasharray", "3 4")
        .attr("stroke-opacity", 0.55);
      svg
        .append("text")
        .attr("x", x(mk.x) + 3).attr("y", m.top + 10)
        .attr("fill", mk.color).attr("font-size", 9)
        .attr("font-family", "var(--font-mono)")
        .text(mk.label);
    }

    const line = d3
      .line<number>()
      .x((_, i) => x(xs[i]))
      .y((v) => y(v));

    const path = svg
      .append("path")
      .datum(ys)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 1);

    if (animate) {
      // Oscilloscope draw-on: the trace sweeps in left-to-right via a dash
      // animation, the way a scope paints a capture.
      const node = path.node() as SVGPathElement;
      const len = node.getTotalLength();
      path
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", len)
        .transition()
        .duration(700)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0)
        .on("end", () => path.attr("stroke-dasharray", null));
    }
  }, [xs, ys, height, xLabel, yLabel, color, animate, markers]);

  return <svg ref={ref} style={{ height }} className="w-full" role="img" aria-label={yLabel} />;
}

/** SKF 6205 drive-end bearing constants: characteristic fault frequencies as
 *  multiples of shaft speed. Shaft rpm varies with motor load in CWRU. */
const RPM_BY_LOAD = [1797, 1772, 1750, 1730] as const;
const FAULT_ORDERS = [
  { key: "BPFI", mult: 5.4152, color: "var(--c-inner_race)" },
  { key: "BPFO", mult: 3.5848, color: "var(--c-outer_race)" },
  { key: "BSF", mult: 2.357, color: "var(--c-ball)" },
] as const;

function faultMarkers(loadHp: number): Marker[] {
  const fr = RPM_BY_LOAD[loadHp] / 60;
  // Fundamental + second harmonic each — where real spall energy concentrates.
  return FAULT_ORDERS.flatMap(({ key, mult, color }) => [
    { x: mult * fr, label: key, color },
    { x: 2 * mult * fr, label: `2×${key}`, color },
  ]);
}

export default function Signals() {
  const segments = useQuery({ queryKey: ["segments"], queryFn: () => api.segments(48) });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const active = selectedId ?? segments.data?.[0]?.segment_id ?? null;
  const activeSeg = segments.data?.find((s) => s.segment_id === active);
  const signal = useQuery({
    queryKey: ["signal", active],
    queryFn: () => api.signal(active!),
    enabled: active !== null,
  });

  const byClass = useMemo(() => {
    const groups = new Map<string, SegmentRef[]>();
    for (const s of segments.data ?? []) {
      const list = groups.get(s.label) ?? [];
      list.push(s);
      groups.set(s.label, list);
    }
    return groups;
  }, [segments.data]);

  const timeAxis = useMemo(
    () =>
      signal.data
        ? signal.data.waveform.map((_, i) => (i / signal.data.sampling_rate) * 1000)
        : [],
    [signal.data],
  );

  if (segments.error) return <ErrorNote error={segments.error} />;

  return (
    <>
      <PageHeader eyebrow="Raw data" title="Signal viewer">
        Drive-end accelerometer waveforms from the CWRU test rig, sampled at 12 kHz, with
        their FFT spectra. The differences the models exploit are visible by eye: healthy
        bearings are near-Gaussian noise; faulted ones carry periodic impact trains that
        push energy into characteristic frequency bands.
      </PageHeader>

      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <Panel index={0} className="h-fit lg:sticky lg:top-20">
          <PanelTitle>Segments</PanelTitle>
          {segments.isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="space-y-4">
              {Array.from(byClass.entries()).map(([label, refs]) => (
                <div key={label}>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">
                    {CLASS_LABEL[label] ?? label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {refs.slice(0, 8).map((s) => {
                      const isActive = s.segment_id === active;
                      return (
                        <button
                          key={s.segment_id}
                          onClick={() => setSelectedId(s.segment_id)}
                          aria-pressed={isActive}
                          title={
                            s.severity > 0 ? `${s.severity}″ · ${s.load_hp} hp` : `${s.load_hp} hp`
                          }
                          className={`rounded border px-2 py-1 font-[family-name:var(--font-mono)] text-[10px] transition-colors duration-200 ${
                            isActive
                              ? "border-accent/60 bg-accent/10 text-ink"
                              : "border-line text-muted hover:border-accent/50 hover:text-ink"
                          }`}
                        >
                          {s.segment_id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-3">
          <Panel index={1}>
            <PanelTitle
              hint={
                signal.data
                  ? `${CLASS_LABEL[signal.data.label]} · ${signal.data.sampling_rate.toLocaleString()} Hz`
                  : undefined
              }
            >
              Waveform{" "}
              {signal.data && (
                <span className="font-[family-name:var(--font-mono)] text-xs text-muted">
                  {signal.data.segment_id}
                </span>
              )}
            </PanelTitle>
            {signal.isLoading || !signal.data ? (
              <Skeleton className="h-[240px]" />
            ) : (
              <LinePlot
                xs={timeAxis}
                ys={signal.data.waveform}
                xLabel="time (ms)"
                yLabel="acceleration (g)"
              />
            )}
          </Panel>

          <Panel index={2}>
            <PanelTitle hint="Hann-windowed, 2048-point FFT">Spectrum</PanelTitle>
            {signal.isLoading || !signal.data ? (
              <Skeleton className="h-[240px]" />
            ) : (
              <LinePlot
                xs={signal.data.fft_freqs}
                ys={signal.data.fft_magnitude}
                xLabel="frequency (Hz)"
                yLabel="|X(f)|"
                color="var(--color-accent)"
                markers={activeSeg ? faultMarkers(activeSeg.load_hp) : []}
              />
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Dashed lines mark the characteristic fault frequencies for this
              recording&rsquo;s shaft speed ({activeSeg ? RPM_BY_LOAD[activeSeg.load_hp] : 1797}{" "}
              rpm): BPFI for inner-race defects, BPFO for outer-race, BSF for ball spin —
              plus second harmonics. A faulted bearing piles energy onto its own line; the
              spectral centroid that shift produces is the strongest feature in the
              significance table (η² = 0.97).
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
