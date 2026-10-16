// AI-assisted: written with Claude Code from the team's build spec.
// Where each contact is, and the road from there to the house: the line a
// ride app draws from the driver to you. Roads come from the public OSRM
// router; without it, a straight line and a rough drive time stand in.
import { roughMinutes, straightMiles } from "./nearby";
import { geocode } from "./nws";

type LatLng = { lat: number; lng: number };

export interface DrivingRoute {
  // [lng, lat] pairs, house last.
  coords: [number, number][];
  minutes: number;
  miles: number;
  // True when the router could not be reached and this is a straight line.
  estimated: boolean;
}

// A contact's town or address to a point. A bare name ("Wolfeboro") is tried
// in New Hampshire first; anything with a comma or state is taken as written.
export async function locatePlace(place: string): Promise<LatLng | null> {
  const tries = /,|\b[A-Z]{2}\b/.test(place) ? [place] : [`${place}, NH`, place];
  for (const [i, q] of tries.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100)); // Nominatim: 1 request a second
    const hit = await geocode(q).catch(() => null);
    if (hit) return { lat: hit.lat, lng: hit.lng };
  }
  return null;
}

const cache = new Map<string, DrivingRoute>();

export async function drivingRoute(from: LatLng, to: LatLng): Promise<DrivingRoute> {
  const key = [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(4)).join(",");
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`, {
      headers: { "User-Agent": process.env.NWS_USER_AGENT || "PilotLight/0.1" },
      signal: AbortSignal.timeout(6000),
    });
    const json = (await res.json()) as { code?: string; routes?: { duration: number; distance: number; geometry: { coordinates: [number, number][] } }[] };
    const r = json.routes?.[0];
    if (res.ok && json.code === "Ok" && r) {
      const route = { coords: r.geometry.coordinates, minutes: Math.max(1, Math.round(r.duration / 60)), miles: Math.round((r.distance / 1609.34) * 10) / 10, estimated: false };
      cache.set(key, route);
      return route;
    }
  } catch {
    // fall through to the straight line
  }
  const miles = straightMiles(from, to);
  return { coords: [[from.lng, from.lat], [to.lng, to.lat]], minutes: roughMinutes(miles), miles: Math.round(miles * 10) / 10, estimated: true };
}
