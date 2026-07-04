"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds only — a SW caching
 * `next dev` assets makes local development maddening.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is progressive enhancement; never surface an error.
    });
  }, []);

  return null;
}
