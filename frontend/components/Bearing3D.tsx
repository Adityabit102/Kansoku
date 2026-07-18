"use client";

import { useEffect, useRef } from "react";

/** Scroll-drivable state for the teardown sequence. All 0..1 except focus. */
export interface BearingState {
  /** 0 assembled → 1 fully exploded along the assembly axis */
  explode: number;
  /** 0 none · 1 inner race + shaft · 2 rolling elements · 3 outer race */
  focus: number;
  /** spin multiplier; 1 = idle speed */
  speed: number;
}

/** A deep-groove ball bearing, live in 3D with real mechanical mass: each race
 *  is a walled ring — inner and outer wall, top and bottom rim, all dotted,
 *  edged with elliptical outlines — plus a keyed shaft end, a sage cage with
 *  radial spokes, and rolling elements shaded as spheres. One is red: the
 *  defect this platform exists to catch, pulsing once per revolution the way
 *  a real spall strikes a race. `stateRef` drives explosion, per-component
 *  spotlight, and shaft speed frame-by-frame. */
export function Bearing3D({
  size = 800,
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

    // Geometry: outer race walls at 0.94/1.08, inner race walls at 0.52/0.66,
    // balls riding the groove between them, shaft inside everything.
    const MID = 0.8, SHAFT = 0.3;
    const BALLS = 10;
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
      // Gentle perspective: strong enough for depth, weak enough that the
      // assembly fills its canvas instead of shrinking into it.
      const persp = 1 / (1.72 - z * 0.42);
      return { sx: size * dpr / 2 + x * scale * persp, sy: cy - y * scale * persp, depth: z };
    };

    const weight = (component: number, focus: number) => {
      if (focus < 0.5) return 1;
      return Math.abs(focus - component) < 0.5 ? 1 : 0.12;
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
      ctx.arc(p.sx, p.sy, base * (0.7 + near * 0.7) * dpr, 0, Math.PI * 2);
      ctx.fill();
    };

    const rim = (r: number, zoff: number, cy: number, scale: number, color: string, w: number) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.32 * w;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let k = 0; k <= 80; k++) {
        const p = project((k / 80) * Math.PI * 2, r, zoff, cy, scale);
        if (k === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    /** A walled race: two concentric walls, each with top+bottom dotted rims
     *  and rim outlines — reads as a solid machined ring. */
    const race = (
      rInnerWall: number, rOuterWall: number, zbase: number, halfWidth: number,
      n: number, phase: number, color: string, w: number, cy: number, scale: number,
    ) => {
      for (const r of [rInnerWall, rOuterWall]) {
        rim(r, zbase - halfWidth, cy, scale, color, w);
        rim(r, zbase + halfWidth, cy, scale, color, w);
        for (const zoff of [zbase - halfWidth, zbase + halfWidth])
          for (let i = 0; i < n; i++)
            dot(project((i / n) * Math.PI * 2 + phase, r, zoff, cy, scale), 1.6, color, w);
      }
    };

    const draw = () => {
      const W = size * dpr, cy = W * 0.52, scale = W * 0.34;
      const st8 = stateRef?.current ?? { explode: 0, focus: 0, speed: 1 };
      const e = Math.max(0, Math.min(1, st8.explode));
      const focus = st8.focus;
      ctx.clearRect(0, 0, W, W);

      if (!reduced) {
        spin += 0.012 * (1 - e * 0.85) * st8.speed;
        wobble = Math.sin(t * 0.0045) * 0.5;
        t++;
      }

      // Defect pulses ripple along the outer race plane (assembled only).
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pu = pulses[i];
        pu.r += 0.014;
        pu.alpha *= 0.965;
        if (pu.alpha < 0.02) { pulses.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(165, 42, 42, ${pu.alpha * (1 - e)})`;
        ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath();
        for (let k = 0; k <= 60; k++) {
          const p = project((k / 60) * Math.PI * 2, pu.r, -e * 0.5, cy, scale);
          if (k === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.stroke();
      }

      const wInner = weight(1, focus), wBalls = weight(2, focus), wOuter = weight(3, focus);

      // Outer race sinks toward the housing; inner rises toward the shaft;
      // the shaft end explodes furthest, the way teardown diagrams stack.
      race(0.94, 1.08, -e * 0.5, 0.075, 88, 0, "#b89767", wOuter, cy, scale);
      race(0.52, 0.66, e * 0.5, 0.06, 60, spin * 1.6, "#d2b48c", wInner, cy, scale);

      // Shaft end: dotted disc + hub + four radial spokes, turning with the
      // inner race. A keyway notch dot marks its rotation.
      const shaftZ = e * 0.86;
      rim(SHAFT, shaftZ, cy, scale, "#c1a26f", wInner);
      for (let i = 0; i < 30; i++)
        dot(project((i / 30) * Math.PI * 2 + spin * 1.6, SHAFT, shaftZ, cy, scale), 1.5, "#c1a26f", wInner);
      ctx.strokeStyle = `rgba(193, 162, 111, ${0.4 * wInner})`;
      ctx.lineWidth = 1 * dpr;
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        const a = (sIdx / 4) * Math.PI * 2 + spin * 1.6;
        const p0 = project(a, 0.06, shaftZ, cy, scale);
        const p1 = project(a, SHAFT - 0.03, shaftZ, cy, scale);
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        ctx.stroke();
      }
      dot(project(spin * 1.6, SHAFT + 0.045, shaftZ, cy, scale), 2.2, "#a52a2a", wInner);
      dot(project(0, 0, shaftZ, cy, scale), 3 , "#c1a26f", wInner);

      // Cage: sage polygon linking the elements, with a spoke to each ball.
      ctx.strokeStyle = `rgba(143, 151, 121, ${0.45 * wBalls})`;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      for (let i = 0; i <= BALLS; i++) {
        const a = (i / BALLS) * Math.PI * 2 + spin * 0.64;
        const p = project(a, MID + e * 0.12, 0, cy, scale);
        if (i === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
      for (let i = 0; i < BALLS; i++) {
        const a = (i / BALLS) * Math.PI * 2 + spin * 0.64;
        const pIn = project(a, MID - 0.09 + e * 0.12, 0, cy, scale);
        const pOut = project(a, MID + 0.09 + e * 0.12, 0, cy, scale);
        ctx.beginPath();
        ctx.moveTo(pIn.sx, pIn.sy);
        ctx.lineTo(pOut.sx, pOut.sy);
        ctx.stroke();
      }

      // Rolling elements as shaded spheres — cage speed ~0.4x shaft speed.
      for (let i = 0; i < BALLS; i++) {
        const a = (i / BALLS) * Math.PI * 2 + spin * 0.64;
        const defect = i === 0;
        const p = project(a, MID + e * 0.12, 0, cy, scale);
        const near = (p.depth + 1) / 2;
        const rad = (defect ? 5.6 : 5.0) * (0.7 + near * 0.7) * dpr;

        if (defect && wBalls === 1 && focus > 0.5) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#a52a2a";
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, rad * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = (0.4 + near * 0.6) * wBalls;
        ctx.fillStyle = defect ? "#a52a2a" : "#8f9779";
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.beginPath();
        ctx.arc(p.sx - rad * 0.3, p.sy - rad * 0.34, rad * 0.38, 0, Math.PI * 2);
        ctx.fill();

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
      style={{ width: "100%", maxWidth: size, aspectRatio: "1" }}
      aria-label="Animated 3D bearing with one marked defect rolling element"
      role="img"
    />
  );
}
