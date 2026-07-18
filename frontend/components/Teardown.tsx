"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion";
import { Bearing3D, type BearingState } from "./Bearing3D";
import { EASE } from "./ui";

/** The five acts of the teardown, keyed to scroll progress through a section
 *  pinned for five viewport heights:
 *
 *    1. 0.00–0.10  assembled, idling — "take it apart"
 *    2. 0.10–0.22  explode into the engineering view
 *    3. 0.22–0.58  spotlight each component in turn (inner → elements → outer),
 *                  the defect glowing during its act
 *    4. 0.58–0.74  reassemble
 *    5. 0.74–1.00  spin up to speed; the defect's impact train writes itself
 *                  onto a live trace below — machine becomes signal
 *
 *  Everything is scrubbed, not played: scroll backward and the machine obeys
 *  in reverse. */

const ACTS = [
  {
    at: [0.22, 0.34],
    focus: 1,
    title: "inner race",
    body: "Press-fitted to the shaft, spinning at full shaft speed. The 12 kHz drive-end accelerometer listens from just outside it.",
    accent: false,
  },
  {
    at: [0.34, 0.46],
    focus: 2,
    title: "rolling elements",
    body: "Nine balls in a sage cage, orbiting at ~0.4× shaft speed. One carries a spall — the red one. Every revolution it strikes a race.",
    accent: true,
  },
  {
    at: [0.46, 0.58],
    focus: 3,
    title: "outer race",
    body: "Fixed in the housing. Impact energy from every strike conducts through it — which is why the sensor can hear the defect at all.",
    accent: false,
  },
] as const;

/** Live trace for act 5: a scrolling signal whose impact amplitude is driven
 *  by scroll progress, so the fault signature literally grows as the bearing
 *  spins up. */
function FaultTrace({ amplitudeRef }: { amplitudeRef: { current: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const W = 520, H = 90;
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const N = 300;
    const buf = new Float64Array(N);
    let t = 0, impact = 0, raf = 0, seed = 21;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296 - 0.5;
    };

    const draw = () => {
      const amp = Math.max(0, Math.min(1, amplitudeRef.current));
      for (let s = 0; s < (reduced ? 0 : 3); s++) {
        if (t % 70 === 0) impact = 1;
        impact *= 0.86;
        buf[t % N] = rand() * 0.35 + impact * amp * (rand() > 0 ? 1 : -1) * 2.4;
        t++;
      }

      ctx.clearRect(0, 0, W * dpr, H * dpr);
      const mid = H / 2;
      for (let i = 1; i < N; i++) {
        const a = buf[(t + i - 1) % N], b = buf[(t + i) % N];
        ctx.strokeStyle = Math.abs(b) > 0.9 ? "#a52a2a" : "rgba(43, 39, 36, 0.6)";
        ctx.lineWidth = 1.1 * dpr;
        ctx.beginPath();
        ctx.moveTo(((i - 1) / (N - 1)) * W * dpr, (mid - a * 16) * dpr);
        ctx.lineTo((i / (N - 1)) * W * dpr, (mid - b * 16) * dpr);
        ctx.stroke();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [amplitudeRef]);

  return <canvas ref={canvasRef} style={{ width: "min(520px, 90vw)", height: 90 }} aria-hidden="true" />;
}

/** One act-rail tick that fills across its share of the spotlight phase. */
function Tick({
  progress,
  index,
  total,
}: {
  progress: import("framer-motion").MotionValue<number>;
  index: number;
  total: number;
}) {
  const scaleX = useTransform(progress, [index / total, (index + 1) / total], [0, 1]);
  return (
    <motion.span
      className="h-[3px] flex-1 origin-left rounded-full bg-tan"
      style={{ scaleX }}
    />
  );
}

export function Teardown() {
  const sectionRef = useRef<HTMLElement>(null);
  const bearingState = useRef<BearingState>({ explode: 0, focus: 0, speed: 1 });
  const traceAmp = useRef(0);
  const [act, setAct] = useState(-1);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const explode = useTransform(scrollYProgress, [0.1, 0.22, 0.58, 0.74], [0, 1, 1, 0]);
  const speed = useTransform(scrollYProgress, [0.74, 0.95], [1, 2.6]);
  const amp = useTransform(scrollYProgress, [0.76, 0.95], [0, 1]);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const current = ACTS.findIndex(({ at }) => p >= at[0] && p < at[1]);
    setAct(current);
    bearingState.current.focus = current === -1 ? 0 : ACTS[current].focus;
  });
  useMotionValueEvent(explode, "change", (v) => { bearingState.current.explode = v; });
  useMotionValueEvent(speed, "change", (v) => { bearingState.current.speed = v; });
  useMotionValueEvent(amp, "change", (v) => { traceAmp.current = v; });

  const introOpacity = useTransform(scrollYProgress, [0, 0.06, 0.13], [1, 1, 0]);
  const actProgress = useTransform(scrollYProgress, [0.22, 0.58], [0, 1]);
  const railOpacity = useTransform(scrollYProgress, [0.2, 0.24, 0.56, 0.62], [0, 1, 1, 0]);
  const traceOpacity = useTransform(scrollYProgress, [0.76, 0.84], [0, 1]);
  const outroOpacity = useTransform(scrollYProgress, [0.88, 0.97], [0, 1]);
  const outroY = useTransform(scrollYProgress, [0.88, 0.97], [16, 0]);

  return (
    <section ref={sectionRef} aria-label="Bearing teardown" className="relative mb-10 h-[500vh]">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        <motion.div style={{ opacity: introOpacity }} className="text-center">
          <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-accent">
            Anatomy of a failure
          </p>
          <p className="text-sm text-muted">keep scrolling — take it apart</p>
        </motion.div>

        <div className="relative">
          <Bearing3D size={430} stateRef={bearingState} />

          {/* Act rail: progress ticks + one label at a time. */}
          <motion.div
            style={{ opacity: railOpacity }}
            className="absolute -right-6 top-1/2 hidden w-80 -translate-y-1/2 md:block lg:-right-72"
          >
            <div className="mb-4 flex gap-1.5" aria-hidden="true">
              {ACTS.map((a, i) => (
                <Tick key={a.title} progress={actProgress} index={i} total={ACTS.length} />
              ))}
            </div>
            <AnimatePresence mode="wait">
              {act >= 0 && (
                <motion.div
                  key={ACTS[act].title}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.28, ease: EASE }}
                >
                  <p
                    className={`font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] ${
                      ACTS[act].accent ? "text-accent" : "text-muted"
                    }`}
                  >
                    {String(act + 1).padStart(2, "0")} / {ACTS.length}
                  </p>
                  <p
                    className={`mt-1 text-sm font-medium ${
                      ACTS[act].accent ? "text-accent" : "text-ink"
                    }`}
                  >
                    {ACTS[act].title}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{ACTS[act].body}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Act 5: machine becomes signal. */}
        <motion.div style={{ opacity: traceOpacity }} className="mt-2 flex flex-col items-center">
          <FaultTrace amplitudeRef={traceAmp} />
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">
            what the accelerometer hears as it spins up
          </p>
        </motion.div>

        <motion.div style={{ opacity: outroOpacity, y: outroY }} className="mt-3 text-center">
          <p className="text-sm font-medium text-ink">
            Reassembled, back at speed — and the defect is still in there.
          </p>
          <p className="mt-1 text-xs text-muted">
            Everything below exists to find it from that trace alone.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
