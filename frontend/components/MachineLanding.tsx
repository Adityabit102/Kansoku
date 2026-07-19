"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, fmtPct } from "@/lib/api";
import "./machine-landing.css";

/* The approved landing engine, ported verbatim from the signed-off mockup:
   one continuous shaft assembly — collar, gear, ribs, bearing with a red
   defect ball, vented housing, bolted flange — rendered by a lathe engine
   with LUT-shaded machined metal, a sweeping specular streak, end-cap faces,
   and a blueprint teardown with leader-line callouts. Four pinned acts scrub
   with scroll; the machine parks as a watermark behind the content below. */

const CREAM = "#f2ebe2", TAN = "#d2b48c", SAGE = "#8f9779", BRICK = "#a52a2a",
      INK = "#2b2724", INKBG = "#241f1b", SAND = "#ffd9ae", LINE = "#5b5248";

interface Part {
  z0: number; z1: number; r: number; ri: number;
  kind: "ring" | "knurl" | "smooth" | "gear" | "ribs" | "race" | "vents";
  tone: number; ex: number; rows: number; bolts?: number; name?: string;
}

const PARTS: Part[] = [
  { z0: -1.60, z1: -1.44, r: 0.92, ri: 0.40, kind: "ring",   tone: 0.9,  ex: -1.5,  rows: 2 },
  { z0: -1.44, z1: -1.06, r: 0.80, ri: 0.36, kind: "knurl",  tone: 0.75, ex: -1.5,  rows: 4 },
  { z0: -1.06, z1: -0.94, r: 0.56, ri: 0.34, kind: "smooth", tone: 0.55, ex: -1.5,  rows: 2 },
  { z0: -0.94, z1: -0.66, r: 0.98, ri: 0.34, kind: "gear",   tone: 0.8,  ex: -0.9,  rows: 3 },
  { z0: -0.66, z1: -0.28, r: 0.54, ri: 0.30, kind: "ribs",   tone: 0.6,  ex: -0.45, rows: 7 },
  { z0: -0.28, z1:  0.06, r: 0.92, ri: 0.76, kind: "race",   tone: 1.0,  ex:  0.55, rows: 3, name: "outer" },
  { z0: -0.24, z1:  0.02, r: 0.50, ri: 0.34, kind: "race",   tone: 0.85, ex: -0.55, rows: 3 },
  { z0:  0.06, z1:  0.58, r: 0.58, ri: 0.40, kind: "vents",  tone: 0.6,  ex:  0.95, rows: 4 },
  { z0:  0.58, z1:  0.76, r: 1.00, ri: 0.42, kind: "ring",   tone: 0.9,  ex:  1.5,  rows: 2, bolts: 8 },
  { z0:  0.76, z1:  0.88, r: 0.72, ri: 0.42, kind: "smooth", tone: 0.7,  ex:  1.5,  rows: 2 },
];
const BALLS = 10, BALL_R = 0.70, BALL_Z = -0.11;
const SEG = 64, NT = 18;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const range = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);

/** Shorten leaderboard names the way the leaderboard page does. */
const shortName = (n: string) =>
  n.replace("Neural Network (MLP)", "MLP").replace("k-Nearest Neighbors", "k-NN")
   .replace("Logistic Regression", "LogReg").replace("Naive Bayes", "NB");

export function MachineLanding() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actsRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Act 3's benchmark card reads the same artifacts as the rest of the site,
  // so a retrain updates it too. Values below fall back to the shipped
  // numbers while loading, keeping first paint identical.
  const leaderboard = useQuery({ queryKey: ["leaderboard"], queryFn: api.leaderboard });
  const manifest = useQuery({ queryKey: ["manifest"], queryFn: api.manifest });
  const significance = useQuery({ queryKey: ["significance"], queryFn: api.significance });
  const top4 = leaderboard.data?.slice(0, 4);
  const gated = significance.data
    ? `${significance.data.filter((r) => r.passes_gate).length}/${significance.data.length} gated`
    : "34/36 gated";
  const segs = manifest.data
    ? `${manifest.data.n_segments.toLocaleString()} segments`
    : "5,886 segments";
  const cardModels = top4
    ? top4.map((r) => `${shortName(r.model_name)} ${fmtPct(r.cv_mean, 1)}`)
    : ["Random Forest 99.9%", "k-NN 98.8%", "LogReg 98.6%", "MLP 96.9%"];
  const cardBig = top4 ? `${fmtPct(top4[0].cv_mean, 2)} CV` : "99.92% CV";

  useEffect(() => {
    const canvas = canvasRef.current, actsEl = actsRef.current, root = rootRef.current;
    if (!canvas || !actsEl || !root) return;
    const ctx = canvas.getContext("2d")!;
    const DPR = Math.min(devicePixelRatio || 1, 1.5);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, raf = 0, narrow = false;
    const resize = () => {
      W = innerWidth; H = innerHeight; narrow = W < 860;
      canvas.width = W * DPR; canvas.height = H * DPR;
    };
    addEventListener("resize", resize); resize();

    const actsBox: HTMLDivElement = actsEl;
    const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    const pins = [".ml-p1", ".ml-p2", ".ml-p3", ".ml-p4"].map($);
    const calloutEls = [0, 1, 2, 3, 4, 5].map((i) => $(".ml-c" + i));
    const s2head = $(".ml-s2-head"), s3head = $(".ml-s3-head"),
          card = $(".ml-stats-card"), s4 = $(".ml-s4-wrap");

    const S = { spin: 0.6, cam: 0 };
    const anim = { explode: 0, blue: 0, xoff: 0.16, yoff: 0, scale: 1, bg: 0, speed: 1, trace: 0, ghost: 1 };
    const target = { ...anim };

    function retarget(p: number, past: number) {
      const s2 = range(p, 0.16, 0.34), s3 = range(p, 0.46, 0.62), s4v = range(p, 0.74, 0.86);
      target.explode = s2 * (1 - s3);
      target.blue = clamp(s2 - s4v * 0.85, 0, 1);
      target.bg = range(p, 0.10, 0.20);
      if (narrow) {
        // Portrait: machine centered, sitting below the copy in the hero and
        // clear of the bottom cards during acts 2-3.
        target.xoff = 0;
        target.yoff = 0.16 * (1 - s2) - 0.06 * s2 * (1 - s3) - 0.08 * s3 * (1 - s4v) + 0.02 * s4v;
        target.scale = 0.9 + 0.12 * s2 - 0.18 * s3;
      } else {
        target.xoff = 0.16 * (1 - s2) - 0.15 * s3 * (1 - s4v);
        target.yoff = 0.06 * s4v;
        target.scale = 0.98 + 0.18 * s2 - 0.22 * s3 + 0.02 * s4v;
      }
      target.speed = 1 + 2.2 * s4v;
      target.trace = s4v * (1 - past);
      target.ghost = 1 - past * 0.92;
    }

    /* fast camera: per-frame constants + trig tables */
    let CYW = 1, SYW = 0, CPT = 1, SPT = 0, SCL = 1, CX0 = 0, CY0 = 0;
    const cosT = new Float64Array(SEG + 1), sinT = new Float64Array(SEG + 1);
    function camFrame() {
      const yaw = -0.60 + Math.sin(S.cam) * 0.04, pit = 0.40 + Math.cos(S.cam * 0.7) * 0.03;
      CYW = Math.cos(yaw); SYW = Math.sin(yaw); CPT = Math.cos(pit); SPT = Math.sin(pit);
      SCL = Math.min(W, H) * 0.44 * anim.scale * DPR;
      CX0 = W * DPR * (0.5 + anim.xoff); CY0 = H * DPR * (0.5 + anim.yoff);
      for (let i = 0; i <= SEG; i++) { const a = i / SEG * Math.PI * 2 + S.spin; cosT[i] = Math.cos(a); sinT[i] = Math.sin(a); }
    }
    interface Pt { x: number; y: number; d: number }
    function proj(ca: number, sa: number, r: number, z: number, out: Pt) {
      const y = r * ca, zz = r * sa;
      const x1 = z * CYW - zz * SYW, z1 = z * SYW + zz * CYW;
      const y1 = y * CPT - z1 * SPT, z2 = y * SPT + z1 * CPT;
      const k = SCL / (2.6 - z2 * 0.5);
      out.x = CX0 + x1 * k; out.y = CY0 + y1 * k; out.d = z2;
      return out;
    }
    const P0 = { x: 0, y: 0, d: 0 }, P1 = { x: 0, y: 0, d: 0 }, P2 = { x: 0, y: 0, d: 0 }, P3 = { x: 0, y: 0, d: 0 };
    const projA = (a: number, r: number, z: number, out: Pt = P0) =>
      proj(Math.cos(a + S.spin), Math.sin(a + S.spin), r, z, out);
    const exZ = (part: Part) => part.ex * anim.explode * 0.8;

    /* color LUTs */
    const hex2 = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const mixC = (a: number[], b: number[], t: number) =>
      `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
    const cINKBG = hex2(INKBG), cINK = hex2(INK), cTAN = hex2(TAN), cSAND = hex2(SAND);
    const LUT = new Map<number, { sh: string[]; sp: string[] }>();
    function lut(tone: number) {
      let l = LUT.get(tone);
      if (l) return l;
      const base = [0, 1, 2].map((i) => lerp(cINK[i], cTAN[i], tone * 0.5));
      const sh: string[] = [], sp: string[] = [];
      for (let k = 0; k <= 48; k++) sh.push(mixC(cINKBG, base, 0.14 + 0.66 * (k / 48)));
      const top = [0, 1, 2].map((i) => lerp(cINKBG[i], base[i], 0.8));
      for (let k = 0; k <= 8; k++) sp.push(mixC(top, cSAND, k / 8 * 0.9));
      l = { sh, sp }; LUT.set(tone, l); return l;
    }
    const mixHex = (h1: string, h2: string, t: number) => mixC(hex2(h1), hex2(h2), t);

    function radiusAt(part: Part, i: number, row: number, rows: number) {
      let r = part.r;
      const f = row / rows, edge = Math.min(f, 1 - f);
      const cham = 1 - 0.09 * Math.max(0, 1 - edge * 4);
      if (part.kind === "knurl") r *= (i + row) % 2 ? 0.975 : 1.035;
      else if (part.kind === "gear") {
        const t = (i * NT / SEG) % 1;
        r *= t < 0.42 ? 1 : t < 0.5 ? 1 - (t - 0.42) * 1.6 : t < 0.92 ? 0.87 : 0.87 + (t - 0.92) * 1.6;
      } else if (part.kind === "ribs") r *= row % 2 ? 0.93 : 1.0;
      else if (part.kind === "race") r *= row === 1 ? 1.02 : 0.99;
      return r * cham;
    }

    function ringPath(r: number, z: number) {
      ctx.beginPath();
      for (let k = 0; k <= SEG; k++) {
        proj(cosT[k], sinT[k], r, z, P0);
        if (k) ctx.lineTo(P0.x, P0.y); else ctx.moveTo(P0.x, P0.y);
      }
      ctx.closePath();
    }

    function band(part: Part) {
      const pz0 = part.z0 + exZ(part), pz1 = part.z1 + exZ(part);
      const rows = part.rows, g = anim.ghost;
      const solidA = (1 - anim.blue) * g;
      const { sh, sp } = lut(part.tone);

      if (solidA > 0.02) {
        ctx.globalAlpha = solidA;
        for (let row = 0; row < rows; row++) {
          const z0 = lerp(pz0, pz1, row / rows), z1 = lerp(pz0, pz1, (row + 1) / rows);
          const ao = 0.86 + 0.14 * Math.sin(Math.PI * (row + 0.5) / rows);
          for (let pass = 0; pass < 2; pass++) {
            const buckets = new Map<string, { col: string; path: Path2D }>();
            for (let i = 0; i < SEG; i++) {
              if (part.kind === "vents" && row === 1 && i % 9 < 3) continue;
              proj(cosT[i], sinT[i], part.r, (z0 + z1) / 2, P0);
              if (pass === 0 ? P0.d > 0 : P0.d <= 0) continue;
              const am = i / SEG * Math.PI * 2;
              const lit = Math.max(0, Math.cos(am + S.spin - 2.35)) * ao;
              const brushed = i % 2 ? 0.985 : 1.0;
              const specv = Math.pow(lit, 16);
              let key: string, col: string;
              if (specv > 0.3) {
                const k = Math.min(8, Math.round((specv - 0.3) / 0.7 * 8));
                key = "s" + k; col = sp[k];
              } else {
                const k = Math.round(lit * brushed * 48);
                key = "d" + k; col = sh[k];
              }
              let b = buckets.get(key);
              if (!b) { b = { col, path: new Path2D() }; buckets.set(key, b); }
              const r0 = radiusAt(part, i, row, rows), r1 = radiusAt(part, i, row + 1, rows);
              proj(cosT[i], sinT[i], r0, z0, P0); proj(cosT[i], sinT[i], r1, z1, P1);
              proj(cosT[i + 1], sinT[i + 1], r1, z1, P2); proj(cosT[i + 1], sinT[i + 1], r0, z0, P3);
              b.path.moveTo(P0.x, P0.y); b.path.lineTo(P1.x, P1.y);
              b.path.lineTo(P2.x, P2.y); b.path.lineTo(P3.x, P3.y); b.path.closePath();
            }
            for (const { col, path } of buckets.values()) { ctx.fillStyle = col; ctx.fill(path); }
          }
        }
        ctx.globalAlpha = solidA * 0.45; ctx.strokeStyle = INKBG; ctx.lineWidth = 1 * DPR;
        ringPath(part.r, pz0); ctx.stroke(); ringPath(part.r, pz1); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const bl = anim.blue * g;
      if (bl > 0.02) {
        ctx.globalAlpha = bl;
        ctx.strokeStyle = mixHex(LINE, INK, 0.35); ctx.lineWidth = 1 * DPR;
        const rings = part.kind === "ribs" ? 7 : 4;
        for (let j = 0; j <= rings; j++) { ringPath(part.r * (part.kind === "gear" ? 0.93 : 1), lerp(pz0, pz1, j / rings)); ctx.stroke(); }
        ringPath(part.ri, pz0); ctx.setLineDash([3 * DPR, 3 * DPR]); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = bl * 0.5;
        for (let e = 0; e < 8; e++) {
          const a = e / 8 * Math.PI * 2;
          projA(a, part.r, pz0, P0); projA(a, part.r, pz1, P1);
          ctx.beginPath(); ctx.moveTo(P0.x, P0.y); ctx.lineTo(P1.x, P1.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    function capFace(part: Part, whichEnd: 0 | 1) {
      const z = (whichEnd === 0 ? part.z0 : part.z1) + exZ(part);
      const g = anim.ghost, solidA = (1 - anim.blue) * g;
      if (solidA < 0.02) return;
      ctx.globalAlpha = solidA;
      ctx.beginPath();
      for (let k = 0; k <= SEG; k++) {
        proj(cosT[k], sinT[k], part.r * 0.985, z, P0);
        if (k) ctx.lineTo(P0.x, P0.y); else ctx.moveTo(P0.x, P0.y);
      }
      for (let k = SEG; k >= 0; k--) { proj(cosT[k], sinT[k], part.ri, z, P0); ctx.lineTo(P0.x, P0.y); }
      ctx.closePath();
      const { sh } = lut(part.tone);
      ctx.fillStyle = sh[Math.round((0.30 + 0.10 * Math.sin(S.cam * 0.9 + z)) * 48)];
      ctx.fill();
      if (part.bolts) {
        for (let b = 0; b < part.bolts; b++) {
          const a = b / part.bolts * Math.PI * 2;
          projA(a, (part.r + part.ri) / 2, z, P0);
          const pr = 5.2 * DPR * anim.scale * (0.7 + ((P0.d + 1) / 2) * 0.5);
          ctx.fillStyle = mixHex(INKBG, TAN, 0.35); ctx.beginPath(); ctx.arc(P0.x, P0.y, pr, 0, 7); ctx.fill();
          ctx.fillStyle = "rgba(255,217,174,.35)"; ctx.beginPath(); ctx.arc(P0.x - pr * 0.3, P0.y - pr * 0.3, pr * 0.4, 0, 7); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    function shine() {
      const a = (1 - anim.blue) * anim.ghost;
      if (a < 0.03) return;
      const aStar = 2.35 - S.spin;
      projA(aStar, 0.9, 0, P0);
      if (P0.d < 0) return;
      for (const [wd, al] of [[6, 0.10], [3, 0.16], [1.4, 0.30]] as const) {
        ctx.globalAlpha = a * al; ctx.strokeStyle = SAND; ctx.lineWidth = wd * DPR; ctx.lineCap = "round";
        ctx.beginPath();
        for (const part of PARTS) {
          projA(aStar, part.r * 1.002, part.z0 + exZ(part) + 0.02, P0);
          projA(aStar, part.r * 1.002, part.z1 + exZ(part) - 0.02, P1);
          ctx.moveTo(P0.x, P0.y); ctx.lineTo(P1.x, P1.y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function shadow() {
      const a = 0.16 * anim.bg * anim.ghost * (1 - anim.blue * 0.7);
      if (a < 0.01) return;
      projA(0, 0.001, 0, P0);
      const grad = ctx.createRadialGradient(P0.x, H * DPR * 0.86, 0, P0.x, H * DPR * 0.86, W * DPR * 0.24);
      grad.addColorStop(0, `rgba(43,39,36,${a})`); grad.addColorStop(1, "rgba(43,39,36,0)");
      ctx.fillStyle = grad;
      ctx.save(); ctx.translate(P0.x, H * DPR * 0.86); ctx.scale(1, 0.22); ctx.translate(-P0.x, -H * DPR * 0.86);
      ctx.fillRect(0, 0, W * DPR, H * DPR * 2); ctx.restore();
    }

    function balls() {
      const zc = BALL_Z, g = anim.ghost;
      ctx.strokeStyle = SAGE; ctx.globalAlpha = (0.5 + 0.3 * anim.blue) * g; ctx.lineWidth = 1.1 * DPR;
      ctx.beginPath();
      for (let i = 0; i <= BALLS; i++) {
        const a = i / BALLS * Math.PI * 2 + S.spin * 0.62;
        projA(a, BALL_R + anim.explode * 0.1, zc, P0);
        if (i) ctx.lineTo(P0.x, P0.y); else ctx.moveTo(P0.x, P0.y);
      }
      ctx.stroke();
      const pts = [...Array(BALLS).keys()].map((i) => {
        const a = i / BALLS * Math.PI * 2 + S.spin * 0.62;
        const q = { x: 0, y: 0, d: 0 }; projA(a, BALL_R + anim.explode * 0.1, zc, q); return { i, q };
      }).sort((m, n) => m.q.d - n.q.d);
      for (const { i, q } of pts) {
        const near = (q.d + 1) / 2, r = (i === 0 ? 7.4 : 6.4) * (0.7 + near * 0.6) * DPR * anim.scale;
        ctx.globalAlpha = g;
        if (i === 0) {
          ctx.globalAlpha = 0.25 * g; ctx.fillStyle = BRICK;
          ctx.beginPath(); ctx.arc(q.x, q.y, r * 2, 0, 7); ctx.fill(); ctx.globalAlpha = g;
        }
        const base = i === 0 ? BRICK : SAGE, dark = i === 0 ? "#5e1717" : "#4d5540";
        const grad = ctx.createRadialGradient(q.x - r * 0.35, q.y - r * 0.38, r * 0.15, q.x, q.y, r);
        grad.addColorStop(0, "#fff2df"); grad.addColorStop(0.25, base); grad.addColorStop(1, dark);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const anchors = [PARTS[1], PARTS[3], null, PARTS[5], PARTS[7], PARTS[8]];
    const sides = [-1, -1, -1, 1, 1, 1];
    function leader(idx: number, alpha: number, fromX: number, fromY: number, elbow: number) {
      const part = anchors[idx];
      if (part) projA(sides[idx] > 0 ? 0.6 : 2.5, part.r * 0.9, (part.z0 + part.z1) / 2 + exZ(part), P0);
      else projA(2.9, BALL_R, BALL_Z, P0);
      ctx.globalAlpha = alpha * 0.8; ctx.lineWidth = 1 * DPR;
      ctx.strokeStyle = idx === 2 ? BRICK : "#b08d54";
      ctx.beginPath(); ctx.moveTo(fromX, fromY);
      ctx.lineTo(fromX + elbow, fromY); ctx.lineTo(P0.x, P0.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(P0.x, P0.y, 3 * DPR, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      ctx.globalAlpha = 1;
    }
    function callouts(alpha: number, p: number) {
      if (narrow) {
        // One part at a time, carousel'd by scroll through act 2's window.
        const active = Math.min(5, Math.floor(range(p, 0.17, 0.42) * 6));
        calloutEls.forEach((el, i) => { el.style.opacity = String(i === active ? alpha : 0); });
        if (alpha < 0.02) return;
        const r = calloutEls[active].getBoundingClientRect();
        leader(active, alpha, (r.left + r.width / 2) * DPR, r.top * DPR, 0);
        return;
      }
      calloutEls.forEach((el) => { el.style.opacity = String(alpha); });
      if (alpha < 0.02) return;
      calloutEls.forEach((el, idx) => {
        const r = el.getBoundingClientRect();
        leader(idx, alpha, (sides[idx] < 0 ? r.right + 10 : r.left - 10) * DPR, (r.top + 14) * DPR, sides[idx] * -30 * DPR);
      });
    }

    const tbuf = new Float64Array(240); let tt = 0, imp = 0, seed = 9;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
    function trace() {
      if (anim.trace < 0.03) return;
      for (let s = 0; s < 3; s++) {
        if (tt % 64 === 0) imp = 1; imp *= 0.87;
        tbuf[tt % 240] = rnd() * 0.3 + imp * anim.trace * (rnd() > 0 ? 1 : -1) * 2.2; tt++;
      }
      const w = Math.min(W * (narrow ? 0.9 : 0.5), 560) * DPR, x0 = W * DPR / 2 - w / 2, y0 = H * DPR * 0.86;
      ctx.globalAlpha = anim.trace;
      for (let i = 1; i < 240; i++) {
        const a = tbuf[(tt + i - 1) % 240], b = tbuf[(tt + i) % 240];
        ctx.strokeStyle = Math.abs(b) > 0.85 ? BRICK : "#5b5248";
        ctx.lineWidth = 1.1 * DPR; ctx.beginPath();
        ctx.moveTo(x0 + (i - 1) / 239 * w, y0 - a * 15 * DPR); ctx.lineTo(x0 + i / 239 * w, y0 - b * 15 * DPR); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function html(p: number, past: number) {
      const vis = [
        1 - range(p, 0.10, 0.17),
        range(p, 0.17, 0.24) * (1 - range(p, 0.40, 0.47)),
        range(p, 0.47, 0.55) * (1 - range(p, 0.66, 0.72)),
        range(p, 0.76, 0.84) * (1 - past),
      ];
      pins.forEach((el, i) => {
        el.classList.toggle("on", vis[i] > 0.01);
        el.style.opacity = String(vis[i]);
        el.setAttribute("aria-hidden", String(vis[i] <= 0.01));
      });
      s2head.style.opacity = String(vis[1]); s3head.style.opacity = String(vis[2]);
      card.style.opacity = String(vis[2]); s4.style.opacity = String(vis[3]);
      return vis[1];
    }

    const bgMix = (t: number) => mixC(hex2(INKBG), hex2(CREAM), t);
    function frame() {
      const rect = actsBox.getBoundingClientRect();
      const actMax = actsBox.offsetHeight - innerHeight;
      const scrolled = -rect.top;
      const p = clamp(scrolled / Math.max(actMax, 1), 0, 1);
      const past = range(scrolled, actMax, actMax + innerHeight * 0.7);
      retarget(p, past);
      let k: keyof typeof anim;
      for (k in anim) anim[k] = lerp(anim[k], target[k], 0.11);
      if (!reduced) { S.spin += 0.008 * (1 - anim.explode * 0.8) * anim.speed; S.cam += 0.004; }
      camFrame();

      ctx.fillStyle = bgMix(anim.bg);
      ctx.fillRect(0, 0, W * DPR, H * DPR);

      shadow();
      const ordered = [...PARTS].sort((a, b) => {
        projA(1.5, a.r, (a.z0 + a.z1) / 2 + exZ(a), P0); const da = P0.d;
        projA(1.5, b.r, (b.z0 + b.z1) / 2 + exZ(b), P0); return da - P0.d;
      });
      for (const part of ordered) {
        projA(0, 0.01, part.z0 + exZ(part), P0); const d0 = P0.d;
        projA(0, 0.01, part.z1 + exZ(part), P1); const d1 = P1.d;
        capFace(part, d0 < d1 ? 0 : 1);
        band(part);
        capFace(part, d0 < d1 ? 1 : 0);
        if (part.name === "outer") balls();
      }
      shine();
      if (anim.blue * anim.ghost > 0.05) {
        ctx.globalAlpha = anim.blue * anim.ghost * 0.5; ctx.strokeStyle = mixHex(LINE, INK, 0.3);
        ctx.setLineDash([10 * DPR, 6 * DPR]); ctx.lineWidth = 1 * DPR;
        projA(0, 0.001, -2.2 - anim.explode * 1.3, P0); projA(0, 0.001, 1.5 + anim.explode * 1.3, P1);
        ctx.beginPath(); ctx.moveTo(P0.x, P0.y); ctx.lineTo(P1.x, P1.y); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      const co = html(p, past);
      callouts(co * anim.blue, p);
      trace();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, []);

  return (
    <div ref={rootRef}>
      <canvas ref={canvasRef} className="ml-stage" aria-label="Rotating machine assembly teardown" role="img" />
      <div ref={actsRef} className="ml-acts" aria-hidden="true">
        <section /><section /><section /><section />
      </div>

      {/* Act 1 — hero */}
      <div className="ml-pin ml-p1">
        <div className="ml-hero-copy">
          <p className="ml-eyebrow ml-eyebrow-tan">観測 · Kansoku</p>
          <h1 className="ml-h1">
            Bearing faults, diagnosed and <span className="ml-acc">justified.</span>
          </h1>
          <p className="ml-hero-sub">
            Six algorithms, a statistical gate, and one machine that never stops turning.
            Scroll — the whole page is a teardown.
          </p>
          <div className="ml-hero-cta">
            <Link href="/predict" className="ml-btn ml-btn-sand">Diagnose a recording →</Link>
            <Link href="/leaderboard" className="ml-btn ml-btn-dark-ghost">See the benchmark</Link>
          </div>
        </div>
        <p className="ml-cue">scroll — take it apart ↓</p>
      </div>

      {/* Act 2 — blueprint teardown */}
      <div className="ml-pin ml-p2">
        <div className="ml-s2-head">
          <p className="ml-eyebrow">Anatomy of a failure</p>
          <h2 className="ml-h2">Every part, on the record.</h2>
          <p className="ml-sub">
            The assembly opens into its engineering view. One rolling element carries a
            spall — the red one.
          </p>
        </div>
        <div className="ml-callout ml-c0"><span className="ml-mono">01 · drive end</span><b>Locking collar</b>Knurled, torqued to the shaft.</div>
        <div className="ml-callout ml-c1"><span className="ml-mono">02 · input</span><b>Drive gear</b>Turns the shaft at 1,797 rpm under load 0.</div>
        <div className="ml-callout ml-brick ml-c2"><span className="ml-mono">03 · the defect</span><b>Rolling elements</b>Ten balls in a sage cage. The red one strikes a race every revolution.</div>
        <div className="ml-callout ml-c3"><span className="ml-mono">04 · sensing</span><b>Outer race</b>Impact energy conducts through it to the accelerometer.</div>
        <div className="ml-callout ml-c4"><span className="ml-mono">05 · structure</span><b>Vented housing</b>Where the 12 kHz drive-end sensor bolts on.</div>
        <div className="ml-callout ml-c5"><span className="ml-mono">06 · output</span><b>Coupling flange</b>Eight bolts to the dynamometer.</div>
      </div>

      {/* Act 3 — benchmark card */}
      <div className="ml-pin ml-p3">
        <div className="ml-s3-head">
          <p className="ml-eyebrow">Measured, not asserted</p>
          <h2 className="ml-h2">The numbers ride with the machine.</h2>
          <p className="ml-sub">
            Reassembled and back at speed. Every figure came from a recording-grouped
            split — no window of a test recording was ever seen in training.
          </p>
        </div>
        <div className="ml-stats-card">
          <div className="ml-row"><h3>Benchmark</h3><span className="ml-big ml-mono">{cardBig}</span></div>
          <div className="ml-segbar">
            <i style={{ width: "34%", background: "var(--color-accent)" }} />
            <i style={{ width: "22%", background: "var(--color-tan)" }} />
            <i style={{ width: "18%", background: "var(--color-sage)" }} />
            <i style={{ width: "14%", background: "#c1a26f" }} />
            <i style={{ width: "12%", background: "#5c6549" }} />
          </div>
          <div className="ml-legend">
            {cardModels.map((label, i) => (
              <span key={label}>
                <i style={{ background: ["var(--color-accent)", "var(--color-tan)", "var(--color-sage)", "#c1a26f"][i] }} />
                {label}
              </span>
            ))}
            <span><i style={{ background: "#5c6549" }} />{segs}</span>
            <span><i style={{ background: "#7e1f1f" }} />{gated}</span>
          </div>
        </div>
      </div>

      {/* Act 4 — finale */}
      <div className="ml-pin ml-p4">
        <div className="ml-s4-wrap">
          <p className="ml-eyebrow">Machine → signal → verdict</p>
          <h2 className="ml-h2">The defect is still in there. Everything below finds it.</h2>
          <div className="ml-ctas">
            <Link href="/predict" className="ml-btn ml-btn-ink">Diagnose a recording</Link>
            <Link href="/leaderboard" className="ml-btn ml-btn-ghost">See the benchmark</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
