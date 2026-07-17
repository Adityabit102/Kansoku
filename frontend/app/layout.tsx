import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";

// Archivo: an industrial grotesque for the shop-floor voice; IBM Plex Mono for
// instrument numerals — both chosen for the subject, not as defaults.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], display: "swap" });
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kansoku — Fault Diagnosis",
  description:
    "Multi-algorithm bearing fault diagnosis with statistically validated features.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable} h-full antialiased`}>
      <body className="grain flex min-h-full flex-col font-[family-name:var(--font-archivo)]">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-10 md:px-10">
            {children}
          </main>
          <footer className="border-t border-line px-6 py-6 md:px-10">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>観測 Kansoku — CWRU bearing fault diagnosis</span>
              <span className="tabular">Splits grouped by recording · seed 42</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
