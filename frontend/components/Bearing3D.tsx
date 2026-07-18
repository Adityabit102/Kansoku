"use client";

import { useEffect, useRef } from "react";

/** Scroll-drivable state for the teardown sequence. All 0..1 except focus. */
export interface BearingState {
  /** 0 assembled → 1 fully exploded along the assembly axis */
  explode: number;
  /** 0 none · 1 inner race · 2 rolling elements · 3 outer race */
  focus: number;
  /** spin multiplier; 1 = idle speed */
  speed: number;
}

/** A rolling-element bearing, live in 3D: dotted races, a cage polygon, nine
 *  rolling elements, one marked red — the defect this platform exists to
 *  catch. It emits a pulse each revolution, the way a real defect strikes the
 *  race once per pass. `stateRef` lets the scroll sequence drive explosion,
 *  per-component spotlight, and shaft speed frame-by-frame. */
export function Bearing3D({
  size = 380,
  stateRef,
}: {
  size?: number;
  stateRef?: { current: BearingState };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const OUTER = 1.0, INNER = 0.6, MID = (OUTER + INNER) / 2;
    const N_OUT = 56, N_IN = 36, BALLS = 9;
    const tiltX = 1.02;
    let spin = 0, wobble = 0, t = 0;
    let raf = 0;
    const pulses: { r: number; alpha: number }[] = [];

    const project = (a: number, r: number, zoff: number, cy: number, scale: number) => {
      let x = Math.cos(a) * r, y = Math.sin(a) * r, z = zoff;
      const cw = Math.cos(wobble), sw = Math.sin(wobble);
      [x, z] = [x * cw + z * sw, -x * sw + z * cw];
      const ct = Math.cos(tiltX), st = Math.sin(tiltX);
      [y, z] = [y * ct - z * st, y * st + z * ct];
      const persp = 1 / (2.2 - z * 0.7);
      return { sx: size * dpr / 2 + x * scale * persp, sy: cy - y * scale * persp, depth: z };
    };

    // Spotlight weight for a component while `focus` points at another one.
    const weight = (component: number, focus: number) => {
      if (focus < 0.5) return 1;
      return Math.abs(focus - component) < 0.5 ? 1 : 0.14;
    };

    const dot = (
      p: { sx: number; sy: number; depth: number },
      base: number,
      color: string,
      w: number,
    ) => {
      const near = (p.depth + 1) / 2;
      ctx.globalAlpha = (0.35 + near * 0.65) * w;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, base * (0.7 + near * 0.7) * (w > 0.5 ? 1 : 0.85) * dpr, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      const W = size * dpr, cy = W * 0.52, scale = W * 0.33;
      const st8 = stateRef?.current ?? { explode: 0, focus: 0, speed: 1 };
      const e = Math.max(0, Math.min(1, st8.explode));
      const focus = st8.focus;
      ctx.clearRect(0, 0, W, W);

      if (!reduced) {
        // Exploded assemblies barely turn; the final act spins up via speed.
        spin += 0.012 * (1 - e * 0.85) * st8.speed;
        wobble = Math.sin(t * 0.0045) * 0.5;
        t++;
      }

      // Pulses ripple outward along the outer race plane (assembled only).
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pu = pulses[i];
        pu.r += 0.012;
        pu.alpha *= 0.965;
        if (pu.alpha < 0.02) { pulses.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(165, 42, 42, ${pu.alpha * (1 - e)})`;
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        for (let k = 0; k <= 60; k++) {
          const p = project((k / 60) * Math.PI * 2, pu.r, -e * 0.62, cy, scale);
          if (k === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.stroke();
      }

      const wInner = weight(1, focus), wBalls = weight(2, focus), wOuter = weight(3, focus);

      // Outer race sinks toward the housing side when exploded.
      for (let i = 0; i < N_OUT; i++)
        dot(project((i / N_OUT) * Math.PI * 2, OUTER, -e * 0.62, cy, scale), 1.7, "#b89767", wOuter);
      // Inner race rises toward the shaft side.
      for (let i = 0; i < N_IN; i++)
        dot(project((i / N_IN) * Math.PI * 2 + spin * 1.6, INNER, e * 0.62, cy, scale), 1.6, "#d2b48c", wInner);

      // Cage: a faint sage polygon linking the rolling elements — the part
      // most diagrams forget and most failures start in.
      ctx.strokeStyle = `rgba(143, 151, 121, ${0.4 * wBalls})`;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let i = 0; i <= BALLS; i++) {
        const a = (i / BALLS) * Math.PI * 2 + spin * 0.64;
        const p = project(a, MID + e * 0.16, 0, cy, scale);
        if (i === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();

      // Rolling elements — cage speed ~0.4x shaft speed.
      for (let i = 0; i < BALLS; i++) {
        const a = (i / BALLS) * Math.PI * 2 + spin * 0.64;
        const defect = i === 0;
        const p = project(a, MID + e * 0.16, 0, cy, scale);
        // While the elements are spotlighted, the defect glows a halo.
        if (defect && wBalls === 1 && focus > 0.5) {
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = "#a52a2a";
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 8 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        dot(p, defect ? 3.4 : 2.9, defect ? "#a52a2a" : "#8f9779", wBalls);
        if (defect && !reduced && e < 0.25) {
          const phase = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          if (phase < 0.013 * Math.max(1, st8.speed)) pulses.push({ r: MID, alpha: 0.55 });
        }
      }
      ctx.globalAlpha = 1;

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, stateRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      aria-label="Animated 3D bearing with one marked defect rolling element"
      role="img"
    />
  );
}
