// AI-assisted: written with Claude Code from the team's build spec.
// Pilot Light service worker: offline shell, and a background heartbeat where
// the browser supports Periodic Background Sync (Chrome on Android, installed).
const CACHE = "pilot-light-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    // Network first; fall back to the last copy of that page, then the offline page.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL))),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/data/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

function readConfig(key) {
  return new Promise((resolve) => {
    const open = indexedDB.open("pilot-light", 1);
    open.onupgradeneeded = () => {
      const d = open.result;
      if (!d.objectStoreNames.contains("queue")) d.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
      if (!d.objectStoreNames.contains("config")) d.createObjectStore("config");
    };
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      try {
        const get = open.result.transaction("config").objectStore("config").get(key);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
  });
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag !== "pilot-light-heartbeat") return;
  event.waitUntil(
    readConfig("heartbeatHouseholdId").then((id) => {
      if (!id) return;
      return fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: id }),
      }).catch(() => {});
    }),
  );
});
