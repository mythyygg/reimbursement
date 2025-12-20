"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";
import { flushQueue, startQueueListener } from "../lib/offlineQueue";
import { ToastProvider } from "../components/Toast";

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => {
    startQueueListener();
    if (navigator.onLine) {
      void flushQueue();
    }
    if ("serviceWorker" in navigator) {
      // In dev/local: actively unregister stale SW + clear caches to avoid hydration mismatch from cached HTML/JS.
      if (process.env.NODE_ENV !== "production") {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) =>
            Promise.all(regs.map((reg) => reg.unregister().catch(() => undefined)))
          )
          .catch(() => undefined);
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => undefined);
        return;
      }
      // Production only: register SW.
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
