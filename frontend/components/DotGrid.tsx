"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

const COLS = 26;
const ROWS = 6;

/** anime.js staggered dot-grid: a wave ripples out from the center when the
 *  grid scrolls into view, and from any dot you click — the library's
 *  signature effect, recolored to the report palette. */
export function DotGrid() {
  const rootRef = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  const ripple = (from: number | "center") => {
    const dots = rootRef.current?.querySelectorAll<HTMLElement>("[data-dot]");
    if (!dots || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animate(dots, {
      scale: [{ to: 1.9, duration: 160 }, { to: 1, duration: 420 }],
      backgroundColor: [
        { to: "#a52a2a", duration: 160 },
        { to: "#d2b48c", duration: 420 },
      ],
      delay: stagger(26, { grid: [COLS, ROWS], from }),
      ease: "outQuad",
    });
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !played.current) {
          played.current = true;
          ripple("center");
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className="mb-12 flex select-none flex-col items-center gap-[10px] py-2"
      aria-hidden="true"
    >
      {Array.from({ length: ROWS }, (_, r) => (
        <div key={r} className="flex gap-[10px]">
          {Array.from({ length: COLS }, (_, c) => (
            <button
              key={c}
              data-dot
              tabIndex={-1}
              onClick={() => ripple(r * COLS + c)}
              className="h-[5px] w-[5px] cursor-pointer rounded-full border-0 bg-tan p-0"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
