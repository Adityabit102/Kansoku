"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { Bearing3D, type BearingState } from "./Bearing3D";
import { EASE } from "./ui";

/** Hero and teardown share one pinned sequence (5.5 viewport heights):
 *
 *    0.00–0.08  hero: copy left, the bearing idling large on the right
 *    0.08–0.18  the copy dissolves; the bearing flows to center and grows
 *    0.18–0.28  explode into the engineering view
 *    0.28–0.68  spotlight acts — inner race+shaft → rolling elements → outer
 *               race — with display-scale labels on the right
 *    0.68–0.80  reassemble
 *    0.80–1.00  spin up; the defect's impact train writes itself onto a live
 *               trace — machine becomes signal
 *
 *  Everything is scrubbed: scroll backward and the machine obeys in reverse. */

const ACTS = [
  {
    at: [0.28, 0.41],
    focus: 1,
    title: "Inner race",
    body: "Press-fitted to the shaft and turning at full shaft speed — the dotted disc above it is the shaft end itself. The 12 kHz drive-end accelerometer listens from just outside.",
    accent: false,
  },
  {
    at: [0.41, 0.545],
    focus: 2,
    title: "Rolling elements",
    body: "Ten balls held by a sage cage, orbiting at ~0.4× shaft speed. One carries a spall — the red one. Every revolution, it strikes a race.",
    accent: true,
  },
  {
    at: [0.545, 0.68],
    focus: 3,
    title: "Outer race",
    body: "Fixed in the housing. Every strike conducts through it to the sensor — which is the only reason a defect this small is audible at all.",
    accent: false,
  },
] as const;

/** Deterministic PRNG so server- and client-rendered paths match exactly. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function HeroWaveform() {
  const rand = mulberry32(42);
  const n = 360;
  const points: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 100;
    const fault = Math.max(0, (i - n * 0.45) / (n * 0.55));
    let y = (rand() - 0.5) * 14;
    if (fault > 0 && i % 24 < 2) y += (rand() > 0.5 ? 1 : -1) * 34 * fault;
    points.push(`${x.toFixed(2)},${(40 + y).toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 100 80" preserveAspectRatio="none" className="mt-10 h-24 w-full" aria-hidden="true">
      <defs>
        <linearGradient id="wave" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--color-sage)" />
          <stop offset="45%" stopColor="var(--color-tan)" />
          <stop offset="100%" stopColor="var(--color-accent)" />
        </linearGradient>
      </defs>
      <motion.polyline
        points={points.join(" ")}
        fill="none"
        stroke="url(#wave)"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: "easeOut", delay: 0.5 }}
      />
    </svg>
  );
}

function StaggeredTitle() {
  const words = ["Bearing", "faults,", "diagnosed", "and"];
  return (
    <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-ink md:text-[4.3rem] xl:text-[4.8rem]">
      {words.map((w, i) => (
        <span key={w} className="inline-block overflow-hidden pb-1 align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.08 + i * 0.07 }}
          >
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
      <span className="inline-block overflow-hidden pb-1 align-bottom">
        <motion.span
          className="inline-block text-accent"
          initial={{ y: "110%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.08 + words.length * 0.07 }}
        >
          justified.
        </motion.span>
      </span>
    </h1>
  );
}

/** Live trace for the finale: impact amplitude rides scroll progress, so the
 *  fault signature grows as the bearing spins up. */
function FaultTrace({ amplitudeRef }: { amplitudeRef: { current: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const W = 560, H = 84;
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
        ctx.moveTo(((i - 1) / (N - 1)) * W * dpr, (mid - a * 15) * dpr);
        ctx.lineTo((i / (N - 1)) * W * dpr, (mid - b * 15) * dpr);
        ctx.stroke();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [amplitudeRef]);

  return <canvas ref={canvasRef} style={{ width: "min(560px, 90vw)", height: 84 }} aria-hidden="true" />;
}

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
  return <motion.span className="h-1 flex-1 origin-left rounded-full bg-tan" style={{ scaleX }} />;
}

export function HeroTeardown() {
  const sectionRef = useRef<HTMLElement>(null);
  const bearingState = useRef<BearingState>({ explode: 0, focus: 0, speed: 1 });
  const traceAmp = useRef(0);
  const [act, setAct] = useState(-1);
  const [inSequence, setInSequence] = useState(false);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // The flow move: right-of-hero → dead center, growing. Springs smooth the
  // scrub so the travel reads as motion, not as a scrollbar mapping.
  const bearingXRaw = useTransform(scrollYProgress, [0.08, 0.19], ["21vw", "0vw"]);
  const bearingScaleRaw = useTransform(scrollYProgress, [0.08, 0.19], [0.62, 1]);
  const bearingX = useSpring(bearingXRaw, { stiffness: 90, damping: 24 });
  const bearingScale = useSpring(bearingScaleRaw, { stiffness: 90, damping: 24 });

  const explodeRaw = useTransform(scrollYProgress, [0.18, 0.28, 0.68, 0.8], [0, 1, 1, 0]);
  // Springing the explosion keeps wheel-step scrolling from snapping the
  // races between positions — the machine glides apart.
  const explode = useSpring(explodeRaw, { stiffness: 70, damping: 20 });
  const speed = useTransform(scrollYProgress, [0.8, 0.96], [1, 2.6]);
  const amp = useTransform(scrollYProgress, [0.82, 0.96], [0, 1]);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const current = ACTS.findIndex(({ at }) => p >= at[0] && p < at[1]);
    setAct(current);
    setInSequence(p > 0.13);
    bearingState.current.focus = current === -1 ? 0 : ACTS[current].focus;
  });
  useMotionValueEvent(explode, "change", (v) => { bearingState.current.explode = v; });
  useMotionValueEvent(speed, "change", (v) => { bearingState.current.speed = v; });
  useMotionValueEvent(amp, "change", (v) => { traceAmp.current = v; });

  const heroOpacity = useTransform(scrollYProgress, [0, 0.07, 0.15], [1, 1, 0]);
  const heroX = useTransform(scrollYProgress, [0.07, 0.15], [0, -70]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.05, 0.1], [1, 1, 0]);
  const actProgress = useTransform(scrollYProgress, [0.28, 0.68], [0, 1]);
  const railOpacity = useTransform(scrollYProgress, [0.25, 0.3, 0.66, 0.72], [0, 1, 1, 0]);
  const traceOpacity = useTransform(scrollYProgress, [0.82, 0.9], [0, 1]);
  const outroOpacity = useTransform(scrollYProgress, [0.9, 0.98], [0, 1]);
  const outroY = useTransform(scrollYProgress, [0.9, 0.98], [16, 0]);

  return (
    <section ref={sectionRef} aria-label="Hero and bearing teardown" className="relative -mt-10 h-[550vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* The machine: starts right-of-hero, flows to center and grows. */}
        <motion.div
          style={{ x: bearingX, scale: bearingScale }}
          className="w-[min(800px,94vw)]"
        >
          <Bearing3D size={800} stateRef={bearingState} />
        </motion.div>

        {/* Hero copy over the left; dissolves as the teardown begins. */}
        <div
          className="absolute inset-x-6 top-[12%] z-10 md:inset-x-10 lg:top-1/2 lg:max-w-3xl lg:-translate-y-1/2"
          style={{ visibility: inSequence ? "hidden" : "visible" }}
          aria-hidden={inSequence}
        >
          <motion.div style={{ opacity: heroOpacity, x: heroX }}>
            <motion.p
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mb-5 text-[13px] uppercase tracking-[0.28em] text-accent"
            >
              観測 · Observation
            </motion.p>
            <StaggeredTitle />
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.5 }}
              className="mt-7 max-w-2xl text-lg leading-relaxed text-muted md:text-xl"
            >
              Kansoku classifies bearing faults from raw vibration signals — and defends
              every step: an effect-size gate before any model trains, six algorithms on
              identical recording-grouped splits, unlabeled clustering for the regimes the
              labels never encoded.
            </motion.p>
            <HeroWaveform />
          </motion.div>
        </div>

        {/* Scroll cue. */}
        <motion.div
          style={{ opacity: cueOpacity, visibility: inSequence ? "hidden" : "visible" }}
          className="absolute left-1/2 top-24 -translate-x-1/2 text-center"
        >
          <p className="text-[11px] uppercase tracking-[0.24em] text-accent">
            Anatomy of a failure
          </p>
          <motion.p
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="mt-1 text-sm text-muted"
          >
            scroll — take it apart ↓
          </motion.p>
        </motion.div>

        {/* Act rail: display-scale labels, one act at a time. */}
        <motion.div
          style={{ opacity: railOpacity }}
          className="absolute right-[5vw] top-1/2 hidden w-[30rem] -translate-y-1/2 lg:block"
        >
          <div className="mb-6 flex gap-2" aria-hidden="true">
            {ACTS.map((a, i) => (
              <Tick key={a.title} progress={actProgress} index={i} total={ACTS.length} />
            ))}
          </div>
          <AnimatePresence mode="wait">
            {act >= 0 && (
              <motion.div
                key={ACTS[act].title}
                initial={{ opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -26 }}
                transition={{ duration: 0.32, ease: EASE }}
              >
                <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.3em] text-muted">
                  <span className={ACTS[act].accent ? "text-accent" : ""}>
                    {String(act + 1).padStart(2, "0")}
                  </span>{" "}
                  / {ACTS.length}
                </p>
                <p
                  className={`mt-3 text-5xl font-semibold tracking-tight ${
                    ACTS[act].accent ? "text-accent" : "text-ink"
                  }`}
                >
                  {ACTS[act].title}
                </p>
                <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
                  {ACTS[act].body}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Mobile act caption. */}
        <div className="absolute inset-x-6 bottom-10 text-center lg:hidden">
          <AnimatePresence mode="wait">
            {act >= 0 && (
              <motion.p
                key={ACTS[act].title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: EASE }}
                className={`text-lg font-semibold ${
                  ACTS[act].accent ? "text-accent" : "text-ink"
                }`}
              >
                {ACTS[act].title}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Finale: machine becomes signal. */}
        <motion.div
          style={{ opacity: traceOpacity }}
          className="absolute bottom-16 left-1/2 flex -translate-x-1/2 flex-col items-center"
        >
          <FaultTrace amplitudeRef={traceAmp} />
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">
            what the accelerometer hears as it spins up
          </p>
        </motion.div>

        <motion.div
          style={{ opacity: outroOpacity, y: outroY }}
          className="absolute bottom-40 left-1/2 w-full -translate-x-1/2 text-center"
        >
          <p className="text-lg font-semibold text-ink">
            Reassembled, back at speed — and the defect is still in there.
          </p>
          <p className="mt-1 text-sm text-muted">
            Everything below exists to find it from that trace alone.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
