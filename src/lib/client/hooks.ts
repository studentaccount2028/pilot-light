// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushQueue, onQueueChange, pendingCount, sendOrQueue, setHeartbeatHousehold } from "./queue";
import type { ClockDto } from "./types";

// Polls a JSON endpoint. Keeps the last good data on a failed poll so the
// screen never blanks out when the connection drops.
export function usePoll<T>(url: string | null, intervalMs: number, headers?: Record<string, string>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const fetchedAt = useRef(0);
  const headerKey = JSON.stringify(headers ?? {});

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const started = performance.now();
      const res = await fetch(url, { cache: "no-store", headers: JSON.parse(headerKey) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not load.");
        return;
      }
      fetchedAt.current = (started + performance.now()) / 2;
      setData(json as T);
      setError(null);
      setStale(false);
    } catch {
      setStale(true);
    }
  }, [url, headerKey]);

  useEffect(() => {
    load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);

  return { data, setData, error, stale, reload: load, fetchedAt };
}

// The app clock, advanced locally between polls so the countdown ticks smoothly.
export function useAppClock(clock: ClockDto | undefined, fetchedAt: React.RefObject<number>): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    if (!clock) return;
    const base = Date.parse(clock.now);
    const update = () => setNowMs(base + (performance.now() - fetchedAt.current) * clock.multiplier);
    update();
    const t = setInterval(update, clock.multiplier > 1 ? 100 : 1000);
    return () => clearInterval(t);
  }, [clock, fetchedAt]);
  return nowMs;
}

export function usePendingCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = () => pendingCount().then(setN);
    refresh();
    const off = onQueueChange(refresh);
    const online = () => flushQueue();
    window.addEventListener("online", online);
    flushQueue();
    return () => {
      off();
      window.removeEventListener("online", online);
    };
  }, []);
  return n;
}

const HEARTBEAT_MS = 5 * 60_000;

async function batteryPct(): Promise<number | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    if (!nav.getBattery) return null;
    return Math.round((await nav.getBattery()).level * 100);
  } catch {
    return null;
  }
}

// Heartbeat from the phone that lives at the household: every 5 minutes while
// this page is open, plus a 15-minute background sync where the browser allows
// it (Chrome on Android, installed). iOS Safari does not run it in the background.
export function useHeartbeat(householdId: string, enabled: boolean) {
  const [lastResult, setLastResult] = useState<"sent" | "queued" | "paused" | null>(null);
  useEffect(() => {
    if (!enabled) {
      setHeartbeatHousehold(null);
      setLastResult(null);
      return;
    }
    setHeartbeatHousehold(householdId);
    let cancelled = false;
    const beat = async () => {
      try {
        const res = await sendOrQueue("/api/heartbeat", "POST", { household_id: householdId, battery_pct: await batteryPct(), at: new Date().toISOString() });
        if (!cancelled) setLastResult(res);
      } catch {
        if (!cancelled) setLastResult("paused");
      }
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);

    navigator.serviceWorker?.ready
      .then(async (reg) => {
        const sync = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void> } }).periodicSync;
        await sync?.register("pilot-light-heartbeat", { minInterval: 15 * 60_000 });
      })
      .catch(() => {
        // Not granted or not supported; the foreground heartbeat still runs.
      });

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [householdId, enabled]);
  return lastResult;
}
