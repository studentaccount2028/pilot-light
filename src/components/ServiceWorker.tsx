// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    // Production only: in development a caching worker fights hot reload.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
