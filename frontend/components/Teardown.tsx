"use client";

import { useRef } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { Bearing3D } from "./Bearing3D";
import { EASE } from "./ui";

/** Scroll-scrubbed teardown, anime.js-style: the section pins for three
 *  viewport heights while scroll position drives the bearing apart into an
 *  exploded engineering view — labels fly in for each component — and then
 *  reassembles it. Scrubbing (not autoplay) keeps the reader in control:
 *  scroll back up and the machine obeys. */
export function Teardown() {
  const sectionRef = useRef<HTMLElement>(null);
  const explodeRef = useRef(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // 0→0.32 explode · hold · 0.55→0.9 reassemble.
  const explode = useTransform(scrollYProgress, [0, 0.32, 0.55, 0.9], [0, 1, 1, 0]);
  useMotionValueEvent(explode, "change", (v) => {
    explodeRef.current = v;
  });

  const labelOpacity = useTransform(scrollYProgress, [0.12, 0.3, 0.55, 0.72], [0, 1, 1, 0]);
  const labelShift = useTransform(scrollYProgress, [0.12, 0.32], [24, 0]);
  const introOpacity = useTransform(scrollYProgress, [0, 0.08, 0.18], [1, 1, 0]);
  const outroOpacity = useTransform(scrollYProgress, [0.82, 0.94], [0, 1]);
  const outroY = useTransform(scrollYProgress, [0.82, 0.94], [18, 0]);

  const labels = [
    { text: "inner race — turned by the shaft", sub: "12 kHz drive-end accelerometer sits here" },
    { text: "rolling elements — one marked defect", sub: "strikes the race once per revolution", accent: true },
    { text: "outer race — fixed in the housing", sub: "where impact energy is measured" },
  ];

  return (
    <section ref={sectionRef} aria-label="Bearing teardown" className="relative mb-10 h-[300vh]">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        <motion.p
          style={{ opacity: introOpacity }}
          className="mb-2 text-[11px] uppercase tracking-[0.24em] text-accent"
        >
          Anatomy of a failure
        </motion.p>
        <motion.p style={{ opacity: introOpacity }} className="mb-4 text-sm text-muted">
          keep scrolling — take it apart
        </motion.p>

        <div className="relative">
          <Bearing3D size={430} explodeRef={explodeRef} />

          <motion.div
            style={{ opacity: labelOpacity, x: labelShift }}
            className="absolute -right-4 top-0 hidden h-full w-72 flex-col justify-between py-6 md:flex lg:-right-56"
            aria-hidden="true"
          >
            {labels.map((l) => (
              <div key={l.text} className="flex items-start gap-3">
                <span
                  className={`mt-1.5 h-px w-10 shrink-0 ${l.accent ? "bg-accent" : "bg-tan"}`}
                />
                <div>
                  <p className={`text-xs font-medium ${l.accent ? "text-accent" : "text-ink"}`}>
                    {l.text}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{l.sub}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          style={{ opacity: outroOpacity, y: outroY }}
          className="mt-4 text-center"
          transition={{ ease: EASE }}
        >
          <p className="text-sm font-medium text-ink">
            Reassembled. The defect is still in there.
          </p>
          <p className="mt-1 text-xs text-muted">
            Everything below exists to find it from vibration alone.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
