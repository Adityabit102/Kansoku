"use client";

import { useEffect, useRef } from "react";

/** A live instrument card for the hero: a continuously scrolling vibration
 *  trace with periodic fault impacts, and real readouts — RMS, kurtosis, and
 *  peak are computed from the actual ring buffer every few frames, so the
 *  numbers move the way a monitoring console's would. Simulated and labeled
 *  as such. */
export function LiveTelemetry() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rmsRef = useRef<HTMLSpanElement>(null);
  const kurtRef = useRef<HTMLSpanElement>(null);
  const peakRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const W = 460, H = 150;
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const N = 260;
    const buf = new Float64Array(N);
    let t = 0, impact = 0, raf = 0;
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296 - 0.5;
    };

    const step = () => {
      // Impact train: a strike every ~85 samples, ringing down exponentially —
      // the defect signature this platform detects.
      if (t % 85 === 0) impact = 1;
      impact *= 0.88;
      const v = rand() * 0.55 + (impact > 0.02 ? impact * (rand() > 0 ? 1 : -1) * 2.6 : 0);
      buf[t % N] = v;
      t++;
      return v;
    };

    const draw = () => {
      for (let s = 0; s < (reduced ? 0 : 2); s++) step();

      ctx.clearRect(0, 0, W * dpr, H * dpr);

      // Tan graticule, like scope paper.
      ctx.strokeStyle = "rgba(210, 180, 140, 0.35)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= 8; gx++) {
        ctx.beginPath();
        ctx.moveTo((gx * W / 8) * dpr, 0);
        ctx.lineTo((gx * W / 8) * dpr, H * dpr);
        ctx.stroke();
      }
      for (let gy = 0; gy <= 4; gy++) {
        ctx.beginPath();
        ctx.moveTo(0, (gy * H / 4) * dpr);
        ctx.lineTo(W * dpr, (gy * H / 4) * dpr);
        ctx.stroke();
      }

      // Trace: ink normally, red where the excursion is impact-sized.
      const mid = H / 2;
      for (let i = 1; i < N; i++) {
        const a = buf[(t + i - 1) % N], b = buf[(t + i) % N];
        const x0 = ((i - 1) / (N - 1)) * W, x1 = (i / (N - 1)) * W;
        ctx.strokeStyle = Math.abs(b) > 1.1 ? "#a52a2a" : "rgba(43, 39, 36, 0.75)";
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(x0 * dpr, (mid - a * 24) * dpr);
        ctx.lineTo(x1 * dpr, (mid - b * 24) * dpr);
        ctx.stroke();
      }

      // Readouts from the real buffer, every 12 frames.
      if (t % 24 < 2) {
        let sum = 0, sum2 = 0, sum4 = 0, peak = 0;
        for (let i = 0; i < N; i++) {
          const v = buf[i];
          sum += v; sum2 += v * v; sum4 += v ** 4;
          peak = Math.max(peak, Math.abs(v));
        }
        const mean = sum / N;
        const var_ = sum2 / N - mean * mean;
        const rms = Math.sqrt(sum2 / N);
        const kurt = var_ > 1e-9 ? (sum4 / N) / (var_ * var_) : 3;
        if (rmsRef.current) rmsRef.current.textContent = rms.toFixed(3);
        if (kurtRef.current) kurtRef.current.textContent = kurt.toFixed(2);
        if (peakRef.current) peakRef.current.textContent = peak.toFixed(2);
      }

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    for (let i = 0; i < N; i++) step();
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="plate rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
          Vibration feed · simulated
        </p>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          live
        </span>
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", maxWidth: 460, height: 150 }} aria-hidden="true" />
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        {[
          { label: "RMS (g)", ref: rmsRef, init: "0.318" },
          { label: "Kurtosis", ref: kurtRef, init: "3.00" },
          { label: "Peak (g)", ref: peakRef, init: "0.94" },
        ].map((m) => (
          <div key={m.label}>
            <p className="text-[10px] uppercase tracking-wider text-muted">{m.label}</p>
            <p className="tabular mt-0.5 font-[family-name:var(--font-mono)] text-lg text-ink">
              <span ref={m.ref}>{m.init}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Kurtosis rides near 3 between strikes and spikes with each impact — the exact
        behavior the significance gate later proves separates fault classes.
      </p>
    </div>
  );
}
