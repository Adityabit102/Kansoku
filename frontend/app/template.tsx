"use client";

import { motion } from "framer-motion";

/** Route transition: the incoming page rises on a slight 3D fold with a fast
 *  cross-fade. Content-level stagger belongs to each page; this stays short so
 *  the two layers read as one motion. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, rotateX: 4, transformPerspective: 1200 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
