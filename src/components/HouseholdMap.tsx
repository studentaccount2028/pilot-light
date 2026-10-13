// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FilterSpecification, Map as MlMap, Marker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  color: string;
  pulse?: boolean;
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
  el.style.cssText = "position:relative;width:22px;height:22px;";
  el.innerHTML =
    (pulse ? `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};animation:ping-slow 2s cubic-bezier(0,0,.2,1) infinite"></span>` : "") +
    `<span style="position:absolute;inset:0;border-radius:9999px;background:${color};border:4px solid #000;box-shadow:0 0 0 2px #fff"></span>`;
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
}: {
  center: { lat: number; lng: number };
  town: string;
  points: MapPoint[];
  bottomPadding?: number;
  zoom?: number;
  // Nearest fire, police and hospital, drawn with a label and drive time.
  sites?: MapSite[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
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
        });

      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
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
      // Frame the house with its fire and police stations. The hospital is
      // usually a town or two away, so it is left to the list below the map.
      const close = near.filter((site) => site.kind !== "hospital");
      if (points.length === 1 && close.length > 0) {
        const bounds = new maplibre.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat]);
        close.forEach((site) => bounds.extend([site.lng, site.lat]));
        map.fitBounds(bounds, { padding: { top: 60, bottom: 50, left: 70, right: 70 }, maxZoom: 12, duration: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pointsKey, sitesKey, ready]);

  if (failed) return <div className="flex h-full w-full items-center justify-center bg-surface-2 text-[14px] text-muted">Map unavailable on this device</div>;
  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full bg-surface-2" />
      <p className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-3 rounded-md border border-line bg-bg/85 px-2 py-1 text-[11px] font-medium text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#ff8a1f]" /> Fire
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#c9ced6]" /> Police
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#5b91f5]" /> Hospital
        </span>
      </p>
    </div>
  );
}
