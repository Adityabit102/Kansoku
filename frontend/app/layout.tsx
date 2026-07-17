import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

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
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="grain flex min-h-full flex-col font-[family-name:var(--font-inter)]">
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
