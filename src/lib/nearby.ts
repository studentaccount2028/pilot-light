// AI-assisted: written with Claude Code from the team's build spec.
// The closest fire/rescue station, police department and hospital to a
// household, with a drive-time estimate. Sites come from NH GRANIT (static
// file); drive times come from the public OSRM routing service and fall back
// to a straight-line estimate if it cannot be reached.
import { readFile } from "node:fs/promises";
import path from "node:path";

export type SiteKind = "fire" | "police" | "hospital";

export interface NearbySite {
  kind: SiteKind;
  name: string;
  city: string;
  lat: number;
  lng: number;
  miles: number;
  minutes: number;
  // True when the routing service was unavailable and the time is a rough guess.
  estimated: boolean;
}

const CATEGORY: Record<string, SiteKind> = {
  "Fire Departments and Rescue Services": "fire",
  "Police Departments": "police",
  Hospitals: "hospital",
};

interface Anchor {
  kind: SiteKind;
  name: string;
  city: string;
  lat: number;
  lng: number;
}

let anchors: Promise<Anchor[]> | null = null;
function loadAnchors(): Promise<Anchor[]> {
  anchors ??= readFile(path.join(process.cwd(), "public/data/nh_anchors.geojson"), "utf-8").then((text) => {
    const json = JSON.parse(text) as { features: { geometry: { coordinates: [number, number] }; properties: { anchorname: string; city: string; bea_cat: string } }[] };
    return json.features.flatMap((f) => {
      const kind = CATEGORY[f.properties.bea_cat?.trim()];
      return kind ? [{ kind, name: f.properties.anchorname, city: f.properties.city ?? "", lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }] : [];
    });
  });
  return anchors;
}

export function straightMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

// Without routing: rural roads wander, so 1.4x the straight line at 35 mph.
export function roughMinutes(miles: number): number {
  return Math.max(1, Math.round(((miles * 1.4) / 35) * 60));
}

const cache = new Map<string, NearbySite[]>();
const CANDIDATES = 3;

export async function nearbySites(home: { lat: number; lng: number }): Promise<NearbySite[]> {
  const key = `${home.lat.toFixed(4)},${home.lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const all = await loadAnchors();
  // The few closest of each kind by straight line; the road decides between them.
  const shortlist = (["fire", "police", "hospital"] as const).flatMap((kind) =>
    all
      .filter((a) => a.kind === kind)
      .map((a) => ({ ...a, miles: straightMiles(home, a) }))
      .sort((x, y) => x.miles - y.miles)
      .slice(0, CANDIDATES),
  );

  let routed: { minutes: number; miles: number }[] | null = null;
  try {
    const coords = [home, ...shortlist].map((p) => `${p.lng},${p.lat}`).join(";");
    const sources = shortlist.map((_, i) => i + 1).join(";");
    const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=${sources}&destinations=0&annotations=duration,distance`, {
      headers: { "User-Agent": process.env.NWS_USER_AGENT || "PilotLight/0.1" },
      signal: AbortSignal.timeout(6000),
    });
    const json = (await res.json()) as { code?: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
    if (res.ok && json.code === "Ok" && json.durations && json.distances) {
      routed = shortlist.map((s, i) => {
        const seconds = json.durations![i]?.[0];
        const metres = json.distances![i]?.[0];
        return seconds == null || metres == null ? { minutes: roughMinutes(s.miles), miles: s.miles } : { minutes: Math.max(1, Math.round(seconds / 60)), miles: metres / 1609.34 };
      });
    }
  } catch {
    // Routing is a nicety; the straight-line estimate below still answers "who is closest".
  }

  const sites = (["fire", "police", "hospital"] as const).flatMap((kind) => {
    const options = shortlist
      .map((s, i) => ({ ...s, ...(routed ? routed[i] : { minutes: roughMinutes(s.miles), miles: s.miles }) }))
      .filter((s) => s.kind === kind)
      .sort((x, y) => x.minutes - y.minutes || x.miles - y.miles);
    const best = options[0];
    return best ? [{ kind, name: best.name, city: best.city, lat: best.lat, lng: best.lng, miles: Math.round(best.miles * 10) / 10, minutes: best.minutes, estimated: !routed }] : [];
  });

  // Only remember routed answers, so a blip does not pin the rough guess.
  if (routed) cache.set(key, sites);
  return sites;
}
