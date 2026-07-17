"use client";

import { useEffect, useRef } from "react";

/** A rolling-element bearing, live in 3D: outer and inner races as dotted
 *  rings, nine rolling elements orbiting between them, one marked red — the
 *  defect this platform exists to catch. It emits a pulse each revolution,
 *  the way a real defect strikes the race once per pass. Tilted perspective,
 *  slow precession; freezes to a static frame under reduced motion. */
export function Bearing3D({ size = 380 }: { size?: number }) {
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
    const tiltX = 1.02; // radians — the "lying gauge" perspective
    let spin = 0, wobble = 0, t = 0;
    let raf = 0;
    const pulses: { r: number; alpha: number }[] = [];

    // Project a point on the bearing plane (angle a, radius r, height z=0)
    // through tilt + slow Y-precession into screen space.
    const project = (a: number, r: number, cy: number, scale: number) => {
      let x = Math.cos(a) * r, y = Math.sin(a) * r, z = 0;
      const cw = Math.cos(wobble), sw = Math.sin(wobble);
      [x, z] = [x * cw + z * sw, -x * sw + z * cw];
      const ct = Math.cos(tiltX), st = Math.sin(tiltX);
      [y, z] = [y * ct - z * st, y * st + z * ct];
      const persp = 1 / (2.2 - z * 0.7);
      return { sx: size * dpr / 2 + x * scale * persp, sy: cy - y * scale * persp, depth: z };
    };

    const dot = (p: { sx: number; sy: number; depth: number }, base: number, color: string) => {
      const near = (p.depth + 1) / 2;
      ctx.globalAlpha = 0.35 + near * 0.65;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, base * (0.7 + near * 0.7) * dpr, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      const W = size * dpr, cy = W * 0.52, scale = W * 0.36;
      ctx.clearRect(0, 0, W, W);

      if (!reduced) {
        spin += 0.012;
        wobble = Math.sin(t * 0.0045) * 0.5;
        t++;
      }

      // Pulses ripple outward along the outer race plane.
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pu = pulses[i];
        pu.r += 0.012;
        pu.alpha *= 0.965;
        if (pu.alpha < 0.02) { pulses.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(165, 42, 42, ${pu.alpha})`;
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        for (let k = 0; k <= 60; k++) {
          const p = project((k / 60) * Math.PI * 2, pu.r, cy, scale);
          if (k === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // Races: outer fixed, inner counter-rotating (as in a real rig the shaft
      // turns the inner race).
      for (let i = 0; i < N_OUT; i++)
        dot(project((i / N_OUT) * Math.PI * 2, OUTER, cy, scale), 1.7, "#b89767");
      for (let i = 0; i < N_IN; i++)
        dot(project((i / N_IN) * Math.PI * 2 + spin * 1.6, INNER, cy, scale), 1.6, "#d2b48c");

      // Rolling elements — cage speed ~0.4x shaft speed, like the real physics.
      for (let i = 0; i < BALLS; i++) {
        const a = (i / BALLS) * Math.PI * 2 + spin * 0.64;
        const defect = i === 0;
        const p = project(a, MID, cy, scale);
        dot(p, defect ? 3.4 : 2.9, defect ? "#a52a2a" : "#8f9779");
        // Once per revolution the defect passes the top of the race: pulse.
        if (defect && !reduced) {
          const phase = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          if (phase < 0.013) pulses.push({ r: MID, alpha: 0.55 });
        }
      }
      ctx.globalAlpha = 1;

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      aria-label="Animated 3D bearing with one marked defect rolling element"
      role="img"
    />
  );
}
