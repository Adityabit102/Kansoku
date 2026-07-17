"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

/** Flat nav: every core view is one click from anywhere, per the <=2 click rule. */
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/signals", label: "Signals" },
  { href: "/significance", label: "Significance" },
  { href: "/clusters", label: "Clusters" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/predict", label: "Diagnose" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center gap-8 px-6 md:px-10">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5 py-4">
          {/* The 観 mark lands like a hanko seal: overscaled, slightly rotated,
              pressed into place once per full page load. */}
          <motion.span
            initial={{ scale: 2.2, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 17, delay: 0.15 }}
            className="text-lg leading-none text-accent transition-opacity duration-200 group-hover:opacity-80"
          >
            観
          </motion.span>
          <span className="text-sm font-semibold tracking-[0.2em] text-ink">KANSOKU</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="group/link relative whitespace-nowrap px-3 py-4 text-[13px] text-muted transition-colors duration-200 hover:text-ink data-[active=true]:text-ink"
                data-active={active}
              >
                {label}
                {/* Hover: a tan underline sweeps in from the left. */}
                {!active && (
                  <span className="absolute inset-x-3 -bottom-px h-px origin-left scale-x-0 bg-tan transition-transform duration-300 ease-out group-hover/link:scale-x-100" />
                )}
                {active && (
                  // layoutId slides the red indicator between tabs instead of
                  // popping — the one place motion carries meaning here.
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3 -bottom-px h-[2px] bg-accent"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
