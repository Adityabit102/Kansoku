"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { ReactNode } from "react";
import { useCallback, useRef } from "react";

/* Motion language, defined once so every view moves the same way:
   ~220ms, ease-out, opacity + small translate only for 2D; the only 3D motion
   is the TiltCard perspective and the cluster projection — both interactive,
   never ambient. */
export const ENTER = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
};

export const stagger = (i: number) => ({
  ...ENTER,
  transition: { ...ENTER.transition, delay: Math.min(i * 0.035, 0.28) },
});

/** 3D hover tilt: the card leans toward the cursor (max ~5°) on a perspective
 *  stage, springs back on leave. Subtle enough to read as material, not a trick;
 *  inert under reduced-motion because the springs simply stay at rest. */
export function TiltCard({
  children,
  className = "",
  maxDeg = 5,
}: {
  children: ReactNode;
  className?: string;
  maxDeg?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 260, damping: 24 });
  const sy = useSpring(py, { stiffness: 260, damping: 24 });
  const rotateY = useTransform(sx, [0, 1], [-maxDeg, maxDeg]);
  const rotateX = useTransform(sy, [0, 1], [maxDeg, -maxDeg]);

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
  }, [px, py]);

  return (
    <div style={{ perspective: 900 }} className={className}>
      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="h-full"
      >
        {children}
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
    <motion.header {...ENTER} className="mb-10">
      <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">{title}</h1>
      {children && (
        <div className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{children}</div>
      )}
    </motion.header>
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
      {...stagger(index)}
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

/** Large numerals may wear the accent; body copy never does. */
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
      <TiltCard maxDeg={3.5} className="h-full">
        <div className="plate h-full rounded-xl border border-line bg-surface p-5 transition-colors duration-200 hover:border-accent/40">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
          <p
            className={`mt-2 font-[family-name:var(--font-mono)] text-2xl tabular ${
              accent ? "text-accent" : "text-ink"
            }`}
          >
            {value}
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
