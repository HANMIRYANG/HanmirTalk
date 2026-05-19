"use client";

import { useEffect } from "react";

// Registers the SW once per tab on the authenticated shell. Failures are
// swallowed — the app must function without service worker support.
//
// Dev-mode skip: the SW's cache-first strategy on /_next/static/* conflicts
// with Next.js HMR (changed chunks land at new hashes, but a previously
// registered SW still answers from cache for the OLD HTML chunk URLs the
// browser had in memory, breaking React.lazy module resolution and
// producing the infamous "Cannot read properties of undefined (reading
// 'call')" error). PWA is a production concern; skipping registration in
// dev is the cleanest fix and matches typical Next.js PWA setups.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Also actively unregister any SW left over from a previous prod
      // run so the dev tab doesn't keep getting cached chunks served.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister().catch(() => undefined);
      });
      return;
    }
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      // SW requires HTTPS in production; skip silently on intranet HTTP.
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}
