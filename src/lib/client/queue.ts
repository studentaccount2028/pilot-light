// AI-assisted: written with Claude Code from the team's build spec.
// Store-and-forward. A write that cannot reach the server (the house has just
// lost power and broadband) is kept in IndexedDB and sent when any
// connectivity returns, so a battery figure entered at hour three is not lost.
"use client";
import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "pilot-light";
export const QUEUE_STORE = "queue";
export const CONFIG_STORE = "config";

export interface QueuedWrite {
  id?: number;
  url: string;
  method: string;
  body: Record<string, unknown>;
  queuedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function idb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(QUEUE_STORE)) d.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      if (!d.objectStoreNames.contains(CONFIG_STORE)) d.createObjectStore(CONFIG_STORE);
    },
  });
  return dbPromise;
}

const listeners = new Set<() => void>();
export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const changed = () => listeners.forEach((fn) => fn());

export async function pendingCount(): Promise<number> {
  try {
    return await (await idb()).count(QUEUE_STORE);
  } catch {
    return 0; // private browsing or no IndexedDB: the queue is simply unavailable
  }
}

async function enqueue(write: QueuedWrite) {
  await (await idb()).add(QUEUE_STORE, write);
  changed();
}

async function post(write: QueuedWrite): Promise<Response> {
  return fetch(write.url, { method: write.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(write.body) });
}

// Send now; if the network is down, keep it for later. Returns "sent" or
// "queued", or throws when the server itself rejected the write.
export async function sendOrQueue(url: string, method: string, body: Record<string, unknown>): Promise<"sent" | "queued"> {
  const write: QueuedWrite = { url, method, body, queuedAt: new Date().toISOString() };
  let res: Response;
  try {
    res = await post(write);
  } catch {
    await enqueue(write).catch(() => {});
    return "queued";
  }
  if (res.ok) return "sent";
  if (res.status >= 500) {
    await enqueue(write).catch(() => {});
    return "queued";
  }
  const json = await res.json().catch(() => ({}));
  throw new Error(json.error ?? "The server rejected that change.");
}

let flushing = false;
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const d = await idb();
    for (const write of (await d.getAll(QUEUE_STORE)) as QueuedWrite[]) {
      let res: Response;
      try {
        res = await post(write);
      } catch {
        return; // still offline; try again on the next "online" event
      }
      // Sent, or permanently rejected: either way it leaves the queue.
      if (res.ok || (res.status >= 400 && res.status < 500)) await d.delete(QUEUE_STORE, write.id!);
      else return;
    }
  } catch {
    // IndexedDB unavailable
  } finally {
    flushing = false;
    changed();
  }
}

// Tells the service worker which household this phone speaks for.
export async function setHeartbeatHousehold(householdId: string | null) {
  try {
    const d = await idb();
    if (householdId) await d.put(CONFIG_STORE, householdId, "heartbeatHouseholdId");
    else await d.delete(CONFIG_STORE, "heartbeatHouseholdId");
  } catch {
    // ignore
  }
}
