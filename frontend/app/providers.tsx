"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Artifacts are immutable between training runs, so nothing needs refetching
  // on focus; keeping data fresh forever avoids pointless network churn.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    // reducedMotion="user" collapses every animation for users who ask the OS
    // for less motion — one switch instead of per-component checks.
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MotionConfig>
  );
}
