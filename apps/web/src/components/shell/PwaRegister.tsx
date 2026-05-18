"use client";

import { useEffect } from "react";

// Registers the SW once per tab on the authenticated shell. Failures are
// swallowed — the app must function without service worker support.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      // SW requires HTTPS in production; skip silently on intranet HTTP.
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}
