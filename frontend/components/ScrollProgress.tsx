"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/** A thin red beam along the top edge tracking read progress. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX, transformOrigin: "left" }}
      className="fixed inset-x-0 top-0 z-50 h-[2px] bg-accent"
    />
  );
}
