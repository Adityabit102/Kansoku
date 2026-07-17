"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/* Motion language:
   - Entrances are 3D: panels flip up from a slight rotateX on a perspective
     stage as they enter the viewport (once), 300-420ms ease-out.
   - Numbers count up when first seen.
   - Hover is material: cards tilt toward the cursor with a moving sheen.
   All of it collapses under prefers-reduced-motion via MotionConfig. */
export const EASE = [0.16, 1, 0.3, 1] as const;

export const ENTER = {
  initial: { opacity: 0, y: 14, rotateX: 7, transformPerspective: 900 },
  animate: { opacity: 1, y: 0, rotateX: 0 },
  transition: { duration: 0.42, ease: EASE },
};

export const stagger = (i: number) => ({
  ...ENTER,
  transition: { ...ENTER.transition, delay: Math.min(i * 0.06, 0.42) },
});

/** Scroll-triggered variant: same 3D rise, fired when the element enters the
 *  viewport instead of on mount. */
export const REVEAL = {
  initial: { opacity: 0, y: 18, rotateX: 8, transformPerspective: 900 },
  whileInView: { opacity: 1, y: 0, rotateX: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: EASE },
};

/** Animated numeral: counts from 0 to the number embedded in `value` when it
 *  first scrolls into view, preserving any prefix/suffix ("99.92%", "5,886"). */
export function CountUp({ value, className = "" }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  // Starts zeroed; the animation's first onUpdate frame writes the real value,
  // so no synchronous setState is needed inside the effect.
  const [text, setText] = useState(() => value.replace(/[\d,]+(\.\d+)?/, "0"));

  useEffect(() => {
    if (!inView) return;
    const match = value.match(/([\d,]+(?:\.\d+)?)/);
    if (!match) return;
    const target = parseFloat(match[1].replace(/,/g, ""));
    const decimals = match[1].includes(".") ? match[1].split(".")[1].length : 0;
    const grouped = match[1].includes(",");
    const controls = animate(0, target, {
      duration: 1.1,
      ease: EASE,
      onUpdate: (v) => {
        const s = grouped ? Math.round(v).toLocaleString() : v.toFixed(decimals);
        setText(value.replace(match[1], s));
      },
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}

/** 3D hover tilt with a cursor-tracking sheen. ~10° of lean, slight lift, and
 *  a soft light sweep across the surface — unmistakably dimensional without
 *  becoming a toy. */
export function TiltCard({
  children,
  className = "",
  maxDeg = 10,
}: {
  children: ReactNode;
  className?: string;
  maxDeg?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 220, damping: 20 });
  const sy = useSpring(py, { stiffness: 220, damping: 20 });
  const rotateY = useTransform(sx, [0, 1], [-maxDeg, maxDeg]);
  const rotateX = useTransform(sy, [0, 1], [maxDeg, -maxDeg]);
  const sheenX = useTransform(sx, [0, 1], ["-60%", "160%"]);
  const [hovered, setHovered] = useState(false);

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      px.set((e.clientX - r.left) / r.width);
      py.set((e.clientY - r.top) / r.height);
    },
    [px, py],
  );
  const onLeave = useCallback(() => {
    px.set(0.5);
    py.set(0.5);
    setHovered(false);
  }, [px, py]);

  return (
    <div style={{ perspective: 800 }} className={className}>
      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={onLeave}
        animate={{ scale: hovered ? 1.015 : 1 }}
        transition={{ duration: 0.25, ease: EASE }}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative h-full"
      >
        {children}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
          animate={{ opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="absolute inset-y-0 w-1/3 -skew-x-12"
            style={{
              left: sheenX,
              background:
                "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.35), transparent)",
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-10" style={{ perspective: 900 }}>
      <motion.p
        initial={{ opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="mb-2 text-[11px] uppercase tracking-[0.22em] text-accent"
      >
        {eyebrow}
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 22, rotateX: 10, transformPerspective: 900 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
        className="text-3xl font-semibold tracking-tight text-ink md:text-4xl"
      >
        {title}
      </motion.h1>
      {children && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.14 }}
          className="mt-3 max-w-3xl text-sm leading-relaxed text-muted"
        >
          {children}
        </motion.div>
      )}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
        style={{ transformOrigin: "left" }}
        className="mt-6 h-px bg-gradient-to-r from-accent/60 via-tan to-transparent"
      />
    </header>
  );
}

export function Panel({
  children,
  className = "",
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <motion.section
      {...REVEAL}
      transition={{ ...REVEAL.transition, delay: Math.min(index * 0.07, 0.35) }}
      className={`plate rounded-xl border border-line bg-surface p-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function PanelTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-medium tracking-wide text-ink">{children}</h2>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** Large numerals may wear the accent; body copy never does. Values count up
 *  when first seen. */
export function Stat({
  label,
  value,
  sub,
  accent = false,
  index = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  index?: number;
}) {
  return (
    <motion.div {...stagger(index)} className="h-full">
      <TiltCard maxDeg={6} className="h-full">
        <div className="plate h-full rounded-xl border border-line bg-surface p-5 transition-colors duration-200 hover:border-accent/40">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
          <p
            className={`mt-2 font-[family-name:var(--font-mono)] text-2xl tabular ${
              accent ? "text-accent" : "text-ink"
            }`}
          >
            <CountUp value={value} />
          </p>
          {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
        </div>
      </TiltCard>
    </motion.div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} />;
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const offline = /failed to fetch|networkerror|load failed/i.test(message);
  return (
    <div className="plate rounded-xl border border-accent/40 bg-surface p-5">
      <p className="text-sm font-medium text-ink">
        {offline ? "Cannot reach the Kansoku API" : "Something went wrong"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {offline ? (
          <>
            Start the backend, then reload:{" "}
            <code className="font-[family-name:var(--font-mono)] text-ink">
              uvicorn kansoku.api.main:app --port 8000
            </code>
          </>
        ) : (
          message
        )}
      </p>
    </div>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "pass" | "fail" }) {
  const tones = {
    muted: "border-line text-muted",
    pass: "border-sage/60 bg-sage/15 text-sage-deep",
    fail: "border-accent/40 bg-accent/5 text-accent",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
