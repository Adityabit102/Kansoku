"use client";

import { motion } from "framer-motion";

/** Route transition: a fast opacity-only cross-fade. Deliberately no
 *  transform here — a transformed ancestor becomes the containing block for
 *  every position:fixed descendant (the welcome overlay, the scroll beam),
 *  silently unpinning them from the viewport. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
