// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FilterSpecification, GeoJSONSource, Map as MlMap, Marker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  color: string;
  pulse?: boolean;
}

// A contact on the map. With a route and progress they are drawn on the road
// to the house, like a driver in a ride app; otherwise at where they live.
export interface MapPerson {
  id: string;
  initials: string;
  name: string;
  lat: number;
  lng: number;
  stage: "idle" | "alerted" | "seen" | "help" | "on_way" | "arrived";
  label: string;
  route?: [number, number][] | null;
  progress?: number;
}

const RING: Record<MapPerson["stage"], string> = {
  idle: "#3a3f48",
  alerted: "#f2c94c",
  seen: "#828fff",
  help: "#eb5757",
  on_way: "#f7f8f8",
  arrived: "#4cb782",
};

// The point a fraction of the way along a line, by distance.
function along(coords: [number, number][], t: number): { at: [number, number]; index: number } {
  if (coords.length < 2) return { at: coords[0], index: 0 };
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const k = Math.cos((coords[i][1] * Math.PI) / 180);
    const d = Math.hypot((coords[i][0] - coords[i - 1][0]) * k, coords[i][1] - coords[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] > 0 ? Math.min(1, want / seg[i]) : 0;
      const [a, b] = [coords[i], coords[i + 1]];
      return { at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], index: i };
    }
    want -= seg[i];
  }
  return { at: coords[coords.length - 1], index: coords.length - 2 };
}

function where(p: MapPerson): [number, number] {
  if (p.stage === "on_way" && p.route && p.route.length > 1) return along(p.route, p.progress ?? 0).at;
  return [p.lng, p.lat];
}

// The root is left unstyled: MapLibre positions it absolutely, and an inline
// position would override that and stack the markers.
function avatar(): { el: HTMLElement; face: HTMLElement; tag: HTMLElement; ring: HTMLElement } {
  const el = document.createElement("div");
  const box = document.createElement("div");
  box.style.cssText = "position:relative;width:34px;height:34px;";
  el.append(box);
  const ring = document.createElement("span");
  ring.style.cssText = "position:absolute;inset:-6px;border-radius:9999px;animation:ping-slow 2s cubic-bezier(0,0,.2,1) infinite;display:none;";
  const face = document.createElement("div");
  face.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:#f7f8f8;color:#08090a;font:700 12px/1 var(--font-inter),system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.6);";
  const tag = document.createElement("div");
  tag.style.cssText =
    "position:absolute;bottom:42px;left:50%;transform:translateX(-50%);white-space:nowrap;border-radius:9999px;padding:3px 8px;font:600 11px/1.2 var(--font-inter),system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.5);";
  box.append(ring, face, tag);
  return { el, face, tag, ring };
}

function paint(a: ReturnType<typeof avatar>, p: MapPerson) {
  const live = p.stage === "on_way";
  a.face.textContent = p.initials;
  a.face.style.border = `3px solid ${RING[p.stage]}`;
  a.face.style.opacity = p.stage === "idle" ? "0.8" : "1";
  a.ring.style.display = live ? "block" : "none";
  a.ring.style.background = "rgba(247,248,248,.35)";
  a.tag.textContent = p.label;
  a.tag.style.display = p.label ? "block" : "none";
  a.tag.style.background = live ? "#f7f8f8" : "#0f1011";
  a.tag.style.color = live ? "#08090a" : "#f7f8f8";
  a.tag.style.border = live ? "none" : "1px solid #2c2f36";
  a.el.style.zIndex = live ? "3" : p.stage === "idle" ? "1" : "2";
}

export interface MapSite {
  kind: "fire" | "police" | "hospital";
  name: string;
  lat: number;
  lng: number;
  minutes: number;
}

const STREETS = "https://tiles.openfreemap.org/styles/dark";
// Used when the street tiles cannot be reached: town outlines only, no network needed.
const BLANK: StyleSpecification = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0c0c0c" } }] };

function pin(color: string, pulse: boolean): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = `<div style="position:relative;width:22px;height:22px;">` +
    (pulse ? `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};animation:ping-slow 2s cubic-bezier(0,0,.2,1) infinite"></span>` : "") +
    `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};border:4px solid #000;box-shadow:0 0 0 2px #fff"></span></div>`;
  return el;
}

const SITE: Record<MapSite["kind"], { color: string; word: string }> = {
  fire: { color: "#ff8a1f", word: "Fire" },
  police: { color: "#f7f8f8", word: "Police" },
  hospital: { color: "#5b91f5", word: "Hospital" },
};

function siteLabel(site: MapSite, lift = 0): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;";
  const tag = document.createElement("div");
  tag.style.cssText = "display:flex;align-items:center;gap:5px;background:#0f1011;border:1px solid #2c2f36;border-radius:6px;padding:3px 7px;font:600 11px/1.2 var(--font-inter),system-ui,sans-serif;color:#f7f8f8;white-space:nowrap;";
  const dot = document.createElement("span");
  dot.style.cssText = `width:7px;height:7px;border-radius:9999px;background:${SITE[site.kind].color};`;
  tag.append(dot, document.createTextNode(`${SITE[site.kind].word} · ${site.minutes} min`));
  const stem = document.createElement("div");
  stem.style.cssText = `width:1px;height:${8 + lift}px;background:#5a5f6a;`;
  el.append(tag, stem);
  return el;
}

// A street map with the household marked, the town outlined, and fire/rescue,
// hospital and urgent-care sites from NH GRANIT. Fills its parent.
export function HouseholdMap({
  center,
  town,
  points,
  bottomPadding = 0,
  // Wide enough to take in the neighbouring towns' fire stations and the nearest hospital.
  zoom = 10.1,
  sites = [],
  people = [],
  legend = true,
}: {
  center: { lat: number; lng: number };
  town: string;
  points: MapPoint[];
  bottomPadding?: number;
  zoom?: number;
  // Nearest fire, police and hospital, drawn with a label and drive time.
  sites?: MapSite[];
  // Contacts: where they are, and the road to the house for anyone on the way.
  people?: MapPerson[];
  legend?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const avatars = useRef(new Map<string, { marker: Marker; parts: ReturnType<typeof avatar> }>());
  const [failed, setFailed] = useState(false);
  const pointsKey = JSON.stringify(points);
  const sitesKey = JSON.stringify(sites);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maplibre = (await import("maplibre-gl")).default;
        let style: StyleSpecification | string = BLANK;
        let streets = false;
        try {
          const res = await fetch(STREETS, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            style = (await res.json()) as StyleSpecification;
            streets = true;
          }
        } catch {
          // offline or blocked: fall back to outlines
        }
        if (cancelled || !el.current) return;
        const map = new maplibre.Map({
          container: el.current,
          style,
          center: [center.lng, center.lat],
          zoom,
          attributionControl: false,
          cooperativeGestures: true,
        });
        map.setPadding({ top: 0, left: 0, right: 0, bottom: bottomPadding });
        mapRef.current = map;
        setReady(true);
        map.addControl(new maplibre.AttributionControl({ compact: true, customAttribution: "NH GRANIT" }), "bottom-right");
        map.on("load", () => {
          // Start with the credit collapsed to its (i) button; a tap opens it.
          el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
          map.addSource("towns", { type: "geojson", data: "/data/nh_towns.geojson" });
          const here = ["==", ["downcase", ["get", "name"]], town.toLowerCase()] as unknown as FilterSpecification;
          if (!streets) {
            map.addLayer({ id: "towns-fill", type: "fill", source: "towns", paint: { "fill-color": "#161616" } });
            map.addLayer({ id: "towns-line", type: "line", source: "towns", paint: { "line-color": "#333333", "line-width": 1 } });
          }
          map.addLayer({ id: "town-fill", type: "fill", source: "towns", filter: here, paint: { "fill-color": "#ffffff", "fill-opacity": 0.05 } });
          map.addLayer({ id: "town-line", type: "line", source: "towns", filter: here, paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.7, "line-dasharray": [2, 2] } });
          map.addSource("anchors", { type: "geojson", data: "/data/nh_anchors.geojson" });
          map.addLayer({
            id: "anchors",
            type: "circle",
            source: "anchors",
            paint: {
              "circle-radius": 4,
              "circle-opacity": 0.7,
              "circle-color": ["match", ["get", "bea_cat"], "Fire Departments and Rescue Services", "#ff8a1f", "Police Departments", "#c9ced6", "#5b91f5"],
              "circle-stroke-color": "#08090a",
              "circle-stroke-width": 1.5,
            },
          });
          map.on("click", "anchors", (e) => {
            const f = e.features?.[0];
            if (!f) return;
            new maplibre.Popup({ closeButton: false, offset: 8 }).setLngLat(e.lngLat).setText(`${f.properties.anchorname}`).addTo(map);
          });
          map.on("mouseenter", "anchors", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "anchors", () => (map.getCanvas().style.cursor = ""));
          // The road from each person on the way: bright ahead of them, faint behind.
          map.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({ id: "route-done", type: "line", source: "routes", filter: ["==", ["get", "part"], "done"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f7f8f8", "line-width": 4, "line-opacity": 0.25 } });
          map.addLayer({ id: "route-casing", type: "line", source: "routes", filter: ["==", ["get", "part"], "ahead"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#000000", "line-width": 9 } });
          map.addLayer({ id: "route-ahead", type: "line", source: "routes", filter: ["==", ["get", "part"], "ahead"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f7f8f8", "line-width": 5 } });
          setLoaded(true);
        });

      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    const people = avatars.current;
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      people.clear();
      setReady(false);
      setLoaded(false);
    };
  }, [center.lat, center.lng, town, bottomPadding, zoom]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (cancelled || !map || !ready) return;
      markers.current.forEach((m) => m.remove());
      const points = JSON.parse(pointsKey) as MapPoint[];
      const near = JSON.parse(sitesKey) as MapSite[];
      markers.current = [
        ...near.map((site, i) => {
          // Stations in the same village sit on top of each other; stack their labels.
          const stacked = near.slice(0, i).filter((o) => Math.abs(o.lat - site.lat) < 0.012 && Math.abs(o.lng - site.lng) < 0.02).length;
          return new maplibre.Marker({ element: siteLabel(site, stacked * 42), anchor: "bottom", offset: [0, -6] }).setLngLat([site.lng, site.lat]).setPopup(new maplibre.Popup({ closeButton: false, offset: 26 }).setText(site.name)).addTo(map);
        }),
        ...points.map((p) =>
          new maplibre.Marker({ element: pin(p.color, Boolean(p.pulse)) })
            .setLngLat([p.lng, p.lat])
            .setPopup(new maplibre.Popup({ closeButton: false, offset: 14 }).setText(p.label))
            .addTo(map),
        ),
      ];
    })();
    return () => {
      cancelled = true;
    };
  }, [pointsKey, sitesKey, ready]);

  // People: moved in place every update, so a driver glides instead of blinking.
  const peopleKey = JSON.stringify(people);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (cancelled || !map || !ready) return;
      const list = JSON.parse(peopleKey) as MapPerson[];
      const seen = new Set<string>();
      for (const p of list) {
        seen.add(p.id);
        let entry = avatars.current.get(p.id);
        if (!entry) {
          const parts = avatar();
          const marker = new maplibre.Marker({ element: parts.el }).setLngLat(where(p)).setPopup(new maplibre.Popup({ closeButton: false, offset: 22 }).setText(p.name)).addTo(map);
          entry = { marker, parts };
          avatars.current.set(p.id, entry);
        }
        entry.marker.setLngLat(where(p));
        paint(entry.parts, p);
      }
      for (const [id, entry] of avatars.current) {
        if (!seen.has(id)) {
          entry.marker.remove();
          avatars.current.delete(id);
        }
      }
      if (!loaded) return;
      const features = list.flatMap((p) => {
        if (p.stage !== "on_way" || !p.route || p.route.length < 2) return [];
        const { at, index } = along(p.route, p.progress ?? 0);
        const done = [...p.route.slice(0, index + 1), at];
        const ahead = [at, ...p.route.slice(index + 1)];
        return [
          { type: "Feature" as const, properties: { part: "done" }, geometry: { type: "LineString" as const, coordinates: done } },
          { type: "Feature" as const, properties: { part: "ahead" }, geometry: { type: "LineString" as const, coordinates: ahead } },
        ];
      });
      (map.getSource("routes") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
    })();
    return () => {
      cancelled = true;
    };
  }, [peopleKey, ready, loaded]);

  // Framing. Someone on the way: their whole road, like a ride app. Otherwise
  // the house, its people, and its fire and police stations (the hospital is
  // usually a town or two away, so it is left to the list below the map).
  // Re-framed only when who is on the way changes, not on every tick.
  const frameKey = JSON.stringify({
    house: points[0] ? [points[0].lat, points[0].lng] : null,
    sites: sites.filter((x) => x.kind !== "hospital").map((x) => [x.lat, x.lng]),
    people: people.map((p) => [p.id, p.lat, p.lng, p.stage === "on_way" && p.route ? p.route.length : 0]),
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (cancelled || !map || !ready) return;
      const f = JSON.parse(frameKey) as { house: [number, number] | null; sites: [number, number][]; people: [string, number, number, number][] };
      if (!f.house) return;
      const bounds = new maplibre.LngLatBounds([f.house[1], f.house[0]], [f.house[1], f.house[0]]);
      const driving = people.filter((p) => p.stage === "on_way" && p.route && p.route.length > 1);
      if (driving.length > 0) {
        driving.forEach((p) => p.route!.forEach((c) => bounds.extend(c)));
      } else {
        f.sites.forEach(([lat, lng]) => bounds.extend([lng, lat]));
        f.people.forEach(([, lat, lng]) => bounds.extend([lng, lat]));
      }
      if (bounds.getNorthEast().lat === bounds.getSouthWest().lat) return;
      map.fitBounds(bounds, { padding: { top: 70, bottom: driving.length ? 80 : 50, left: 50, right: 50 }, maxZoom: 13, duration: driving.length ? 800 : 0 });
    })();
    return () => {
      cancelled = true;
    };
    // people is read for the routes; frameKey says when it matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, ready]);

  if (failed) return <div className="flex h-full w-full items-center justify-center bg-surface-2 text-[14px] text-muted">Map unavailable on this device</div>;
  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full bg-surface-2" />
      {legend && <p className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-3 rounded-md border border-line bg-bg/85 px-2 py-1 text-[11px] font-medium text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#ff8a1f]" /> Fire
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#c9ced6]" /> Police
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#5b91f5]" /> Hospital
        </span>
      </p>}
    </div>
  );
}
