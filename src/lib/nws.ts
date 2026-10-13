// AI-assisted: written with Claude Code from the team's build spec.
// National Weather Service: the live trigger. Free, no key, but a User-Agent
// with contact info is required or the API answers 403.
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { nwsAlerts } from "../db/schema";
import { WARNING_EVENTS } from "./engine/rules";

const API = "https://api.weather.gov";

export function userAgent(): string {
  return process.env.NWS_USER_AGENT || "PilotLight/0.1 (set NWS_USER_AGENT to your contact email)";
}

// api.weather.gov has occasional 5xx blips; a short retry rides over them.
async function nwsFetch(path: string, headers: Record<string, string> = {}): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { "User-Agent": userAgent(), Accept: "application/geo+json", ...headers },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (res.status < 500) return res;
      last = new Error(`NWS ${path}: HTTP ${res.status}`);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

interface NwsFeature {
  properties: {
    id: string;
    event: string;
    severity?: string;
    headline?: string;
    onset?: string | null;
    effective?: string | null;
    ends?: string | null;
    expires?: string | null;
    geocode?: { UGC?: string[] };
  };
}

// Turns one NWS alert feature into a row. `ends` is when the hazard ends;
// `expires` is only when this bulletin goes stale, so `ends` wins when present.
export function alertRow(feature: NwsFeature) {
  const p = feature.properties;
  const onset = p.onset ?? p.effective;
  const expires = p.ends ?? p.expires;
  if (!p.id || !p.event || !onset || !expires) return null;
  return {
    id: p.id,
    event: p.event,
    zones: p.geocode?.UGC ?? [],
    onset: new Date(onset),
    expires: new Date(expires),
    severity: p.severity ?? null,
    headline: p.headline ?? null,
    raw: feature as unknown,
  };
}

let etag: string | null = null;

// Fetch active NH alerts, keep the four warning types, upsert on the NWS id,
// and drop live rows that have left the feed. Replay rows are never touched.
export async function pollNws(): Promise<{ status: number; kept: number; total: number }> {
  const res = await nwsFetch("/alerts/active?area=NH", etag ? { "If-None-Match": etag } : {});
  if (res.status === 304) return { status: 304, kept: 0, total: 0 };
  if (!res.ok) throw new Error(`NWS alerts: HTTP ${res.status}`);

  const json = (await res.json()) as { features?: NwsFeature[] };
  const features = json.features ?? [];
  const rows = features
    .filter((f) => (WARNING_EVENTS as readonly string[]).includes(f.properties?.event))
    .map(alertRow)
    .filter((r) => r !== null);

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(nwsAlerts)
        .values({ ...row, replay: false })
        .onConflictDoUpdate({
          target: nwsAlerts.id,
          set: { event: row.event, zones: row.zones, onset: row.onset, expires: row.expires, severity: row.severity, headline: row.headline, raw: row.raw, fetchedAt: new Date() },
        });
    }
    const keep = rows.map((r) => r.id);
    await tx.delete(nwsAlerts).where(keep.length > 0 ? and(eq(nwsAlerts.replay, false), notInArray(nwsAlerts.id, keep)) : eq(nwsAlerts.replay, false));
  });

  // Only remember the ETag once the rows are safely written.
  etag = res.headers.get("etag");
  return { status: res.status, kept: rows.length, total: features.length };
}

const pointCache = new Map<string, { zone: string; zoneName: string | null; county: string | null }>();

// lat/lng -> forecast zone (e.g. NHZ006). Done once when a household is saved.
export async function resolveZone(lat: number, lng: number) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = pointCache.get(key);
  if (hit) return hit;

  const res = await nwsFetch(`/points/${key}`);
  if (!res.ok) throw new Error(`NWS points: HTTP ${res.status}`);
  const json = (await res.json()) as { properties?: { forecastZone?: string; county?: string } };
  const zoneUrl = json.properties?.forecastZone;
  // forecastZone is a URL; the zone code is its last path segment.
  const zone = zoneUrl?.split("/").pop();
  if (!zone) throw new Error("NWS points: no forecast zone for that location");

  let zoneName: string | null = null;
  try {
    const z = await nwsFetch(`/zones/forecast/${zone}`);
    if (z.ok) zoneName = ((await z.json()) as { properties?: { name?: string } }).properties?.name ?? null;
  } catch {
    // The name is only for display; the zone code is what matters.
  }
  const result = { zone, zoneName, county: json.properties?.county?.split("/").pop() ?? null };
  pointCache.set(key, result);
  return result;
}

// Street address -> lat/lng and town, via OpenStreetMap Nominatim (free, 1 req/s).
export async function geocode(address: string) {
  const qs = new URLSearchParams({ format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: "us", q: address });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
    headers: { "User-Agent": userAgent() },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Geocoder: HTTP ${res.status}`);
  const [hit] = (await res.json()) as {
    lat: string;
    lon: string;
    display_name: string;
    address?: Record<string, string>;
  }[];
  if (!hit) return null;
  const a = hit.address ?? {};
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    town: a.town ?? a.city ?? a.village ?? a.municipality ?? a.hamlet ?? "",
    state: a["ISO3166-2-lvl4"]?.replace("US-", "") ?? "",
    displayName: hit.display_name,
  };
}

export interface Located {
  lat: number;
  lng: number;
  town: string;
  // True when the street was not found and the town centre was used instead.
  approximate: boolean;
}

// Finds a New Hampshire address. Pilot Light only covers NH: the warnings it
// polls, the town outlines and the fire and hospital sites are all NH data, so
// a match in another state is treated as "not found", never saved quietly.
// Returns "outside" when the only match is out of state.
export async function locateInNH(address: string, town: string): Promise<Located | "outside" | null> {
  const hasState = /\b(NH|New Hampshire)\b/i.test(address);
  const hasTown = town && address.toLowerCase().includes(town.toLowerCase());
  const full = [address, hasTown ? "" : town, hasState ? "" : "NH"].filter(Boolean).join(", ");

  let outside = false;
  for (const [query, approximate] of [[full, false], [town ? `${town}, NH` : "", true]] as const) {
    if (!query) continue;
    const hit = await geocode(query).catch(() => null);
    if (!hit) continue;
    if (hit.state !== "NH") {
      outside = true;
      continue;
    }
    return { lat: hit.lat, lng: hit.lng, town: hit.town, approximate };
  }
  return outside ? "outside" : null;
}
