// AI-assisted: written with Claude Code from the team's build spec.
// One-time pull of NH GRANIT layers into static files. Run: node scripts/fetch-granit.mjs
// The app never calls GRANIT at runtime.
import { writeFileSync } from "node:fs";

const BASE = "https://nhgeodata.unh.edu/hosting/rest/services/Hosted";

async function query(layer, params) {
  const qs = new URLSearchParams({ outSR: "4326", f: "geojson", ...params });
  const res = await fetch(`${BASE}/${layer}/query?${qs}`);
  if (!res.ok) throw new Error(`${layer}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${layer}: ${JSON.stringify(json.error)}`);
  return json;
}

const towns = await query("Political_Boundaries/FeatureServer/5", {
  where: "1=1",
  outFields: "name,county,fips",
  // ~50 m simplification keeps the statewide file small enough to ship.
  maxAllowableOffset: "0.0005",
  geometryPrecision: "4",
});
writeFileSync("public/data/nh_towns.geojson", JSON.stringify(towns));
console.log(`towns: ${towns.features.length}`);

const anchors = await query("NH_CAI_Locations/FeatureServer/3", {
  where: process.argv[2] ?? "1=1",
  outFields: "anchorname,address,city,county,bea_cat",
  geometryPrecision: "5",
});
writeFileSync("public/data/nh_anchors.geojson", JSON.stringify(anchors));
console.log(`anchors: ${anchors.features.length}`);
