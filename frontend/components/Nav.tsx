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
    <header className="sticky top-0 z-40 border-b border-line bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center gap-8 px-6 md:px-10">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5 py-4">
          <span className="text-lg leading-none text-crimson transition-opacity duration-200 group-hover:opacity-80">
            観
          </span>
          <span className="text-sm font-semibold tracking-[0.2em] text-bone">KANSOKU</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative whitespace-nowrap px-3 py-4 text-[13px] text-muted transition-colors duration-200 hover:text-bone data-[active=true]:text-bone"
                data-active={active}
              >
                {label}
                {active && (
                  // layoutId slides the indicator between tabs instead of
                  // popping — the one place motion carries meaning here.
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3 -bottom-px h-px bg-crimson"
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
