"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { animate, createTimer, stagger, type JSAnimation, type Timer } from "animejs";
import { getInstances } from "animejs/adapters/three";
import * as THREE from "three";
import { EASE } from "./ui";

const TAGLINE = "Observing machines. Finding faults early — so you can focus on solving them.";

/** Engineering graffiti: the margins of a fitter's notebook, scattered around
 *  the welcome screen. Every line is real to the project. */
const GRAFFITI = [
  { text: "BPFO = (N/2)·fr·(1 − d/D·cos φ)", x: "6%", y: "14%", r: -6 },
  { text: "kurtosis ≈ 3 → healthy", x: "74%", y: "12%", r: 4 },
  { text: "spall Ø 0.007″ — audible", x: "10%", y: "76%", r: 3 },
  { text: "12 kHz drive-end accelerometer", x: "70%", y: "80%", r: -4 },
  { text: "η² > 0.14 or it doesn't ship", x: "82%", y: "42%", r: 90 },
  { text: "1797 rpm ≈ 29.95 Hz", x: "4%", y: "44%", r: -90 },
  { text: "inner · outer · ball · cage", x: "28%", y: "8%", r: 2 },
  { text: "one strike per revolution", x: "48%", y: "88%", r: -2 },
] as const;

const PALETTE = ["#a52a2a", "#d2b48c", "#8f9779", "#b89767", "#5c6549", "#7e1f1f", "#c1a26f"];

/** The user's cube-grid design: an instanced-mesh lattice breathing out of and
 *  back into a core, staggered from the center, slowly tumbling — driven by
 *  anime.js through its three.js adapter. */
function CubeGrid() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { width, height } = container.getBoundingClientRect();

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
    camera.position.set(0, 0, 1.5);
    scene.add(camera);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(2, 3, 4);
    scene.add(light);

    const gridSize = 6;
    const cellSize = 2 / gridSize;
    const spread = ((gridSize - 1) / 2) * cellSize;
    const geometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
    const material = new THREE.MeshLambertMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, gridSize ** 3);
    scene.add(mesh);

    const instances = getInstances(mesh);
    const grid3 = { grid: [gridSize, gridSize, gridSize] as [number, number, number] };
    const gridAxis = (axis: "x" | "y" | "z", span = spread) =>
      stagger([-span, span], { ...grid3, axis });

    const anims: JSAnimation[] = [];
    let timer: Timer | null = null;

    if (!reduced) {
      anims.push(
        animate(mesh, {
          rotateY: 360,
          rotateX: 360,
          duration: 24000,
          loop: true,
          ease: "linear",
        }),
        animate(instances, {
          color: PALETTE,
          x: [gridAxis("x", spread * 0.25), gridAxis("x")],
          y: [gridAxis("y", spread * 0.25), gridAxis("y")],
          z: [gridAxis("z", spread * 0.25), gridAxis("z")],
          scale: [0.1, 0.25, 0.1],
          delay: stagger([0, 3000], { ...grid3, from: "center", reversed: true }),
          duration: 2000,
          loopDelay: 500,
          loop: true,
          alternate: true,
          ease: "inOutQuad",
        }),
      );
      timer = createTimer({ onUpdate: () => renderer.render(scene, camera) });
    } else {
      // Static lattice for reduced motion: position instances once, render once.
      animate(instances, {
        color: PALETTE,
        x: gridAxis("x"),
        y: gridAxis("y"),
        z: gridAxis("z"),
        scale: 0.18,
        duration: 0,
      });
      renderer.render(scene, camera);
    }

    return () => {
      anims.forEach((a) => a.cancel());
      timer?.cancel();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="h-[46vh] w-[46vh] max-w-[86vw]" aria-hidden="true" />;
}

function Typewriter({ text, onDone }: { text: string; onDone: () => void }) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => {
        setN(text.length);
        onDone();
      });
      return () => cancelAnimationFrame(raf);
    }
    const id = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(id);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone();
          }
          return v;
        }
        return v + 1;
      });
    }, 38);
    return () => window.clearInterval(id);
  }, [text, onDone]);

  return (
    <p className="mx-auto max-w-2xl text-balance text-xl font-medium leading-relaxed text-ink md:text-2xl">
      {text.slice(0, n)}
      <motion.span
        aria-hidden
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.7, repeat: Infinity, repeatType: "reverse" }}
        className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.2em] bg-accent"
      />
    </p>
  );
}

/** Full-screen welcome gate shown once per session, before the landing page.
 *  Click, Enter, or Escape skips; otherwise it advances shortly after the
 *  typewriter finishes. */
export function Welcome() {
  const [show, setShow] = useState(false);
  const [typed, setTyped] = useState(false);

  useEffect(() => {
    // Deferred a frame: the gate reads sessionStorage (client-only), and the
    // lint rule rightly dislikes synchronous setState inside effects.
    const raf = requestAnimationFrame(() => {
      if (!sessionStorage.getItem("kansoku-welcomed")) setShow(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [show]);

  const dismiss = useCallback(() => {
    sessionStorage.setItem("kansoku-welcomed", "1");
    setShow(false);
  }, []);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, dismiss]);

  useEffect(() => {
    if (!typed) return;
    const id = window.setTimeout(dismiss, 1800);
    return () => window.clearTimeout(id);
  }, [typed, dismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="welcome"
          exit={{ y: "-100%" }}
          transition={{ duration: 0.7, ease: [0.7, 0, 0.3, 1] }}
          onClick={dismiss}
          className="fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-canvas"
          role="button"
          aria-label="Enter Kansoku"
          tabIndex={0}
        >
          {/* Graffiti margins. */}
          {GRAFFITI.map((g, i) => (
            <motion.p
              key={g.text}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ duration: 0.8, delay: 0.6 + i * 0.18 }}
              style={{ left: g.x, top: g.y, rotate: g.r }}
              className="pointer-events-none absolute hidden font-[family-name:var(--font-mono)] text-[11px] tracking-wide text-muted md:block"
            >
              {g.text}
            </motion.p>
          ))}

          {/* A sketched bearing scribble, drawn in like a margin doodle. */}
          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute left-[14%] top-[58%] hidden h-24 w-24 md:block"
            aria-hidden="true"
          >
            <motion.circle
              cx="50" cy="50" r="38" fill="none" stroke="#b89767" strokeWidth="1"
              strokeDasharray="4 3"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, delay: 1 }}
            />
            <motion.circle
              cx="50" cy="50" r="20" fill="none" stroke="#8f9779" strokeWidth="1"
              strokeDasharray="3 3"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, delay: 1.5 }}
            />
            <motion.circle
              cx="79" cy="50" r="3.4" fill="#a52a2a"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 2.1, type: "spring", stiffness: 300, damping: 16 }}
            />
          </svg>

          <CubeGrid />

          <div className="relative z-10 -mt-6 px-6 text-center">
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
              className="mb-4 text-[11px] uppercase tracking-[0.3em] text-accent"
            >
              観測 Kansoku
            </motion.p>
            <Typewriter text={TAGLINE} onDone={() => setTyped(true)} />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: typed ? 1 : 0 }}
              transition={{ duration: 0.5 }}
              className="mt-6 text-xs uppercase tracking-[0.2em] text-muted"
            >
              click anywhere to enter
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
