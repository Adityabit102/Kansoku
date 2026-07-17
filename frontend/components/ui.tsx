"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/* Motion language, defined once so every view moves the same way:
   ~220ms, ease-out, opacity + small translate only. Nothing bounces, nothing
   scales, nothing moves more than 8px. */
export const ENTER = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
};

export const stagger = (i: number) => ({
  ...ENTER,
  transition: { ...ENTER.transition, delay: Math.min(i * 0.035, 0.28) },
});

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
      <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-teal-bright">{eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-sand md:text-4xl">{title}</h1>
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
      className={`rounded-lg border border-line bg-surface p-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function PanelTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-medium tracking-wide text-sand">{children}</h2>
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
    <motion.div
      {...stagger(index)}
      className="group rounded-lg border border-line bg-surface p-5 transition-colors duration-200 hover:border-teal/60"
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p
        className={`mt-2 font-[family-name:var(--font-mono)] text-2xl tabular ${
          accent ? "text-teal-bright" : "text-sand"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
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
    <div className="rounded-lg border border-ember-bright/40 bg-ember/15 p-5">
      <p className="text-sm font-medium text-sand">
        {offline ? "Cannot reach the Kansoku API" : "Something went wrong"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {offline ? (
          <>
            Start the backend, then reload:{" "}
            <code className="font-[family-name:var(--font-mono)] text-sand">
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
    pass: "border-sand/25 text-sand",
    fail: "border-ember-bright/40 text-ember-bright",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
