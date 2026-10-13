// AI-assisted: written with Claude Code from the team's build spec.
// Pulls the bulletin text for each labelled event from the IEM archive and
// extracts what the forecasters said: ice accumulation, wind gusts, snow.
// These are the features the outage-risk model needs beyond the event type.
// Output: data/backtest/events-text.json  Run: node scripts/fetch-event-text.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseHazardText } from "./hazard-text.mjs";

const DIR = "data/backtest";
const OUT = path.join(DIR, "events-text.json");
// Raw bulletins are cached (gitignored) so the parser can be improved without refetching.
const RAW = path.join(DIR, "events-text-raw.json");
const QUALIFYING = new Set(["WS.W", "IS.W", "HW.W", "BZ.W", "WI.Y"]);
const ZONE_COUNTY = {
  NHZ001: "33007", NHZ002: "33007", NHZ003: "33009", NHZ005: "33009", NHZ004: "33003", NHZ006: "33003",
  NHZ007: "33019", NHZ008: "33013", NHZ009: "33001", NHZ010: "33017", NHZ011: "33005",
  NHZ012: "33011", NHZ015: "33011", NHZ013: "33015", NHZ014: "33015",
};

const COUNTY_ZONES = {};
for (const [zone, fips] of Object.entries(ZONE_COUNTY)) (COUNTY_ZONES[fips] ??= []).push(zone);
const VTEC_CODE = { "Winter Storm Warning": ".WS.W.", "Ice Storm Warning": ".IS.W.", "High Wind Warning": ".HW.W.", "Blizzard Warning": ".BZ.W.", "Wind Advisory": ".WI.Y." };

// Expands a UGC header like "MEZ007>009-012-NHZ001-002-010-290800-" into zone codes.
function expandUgc(header) {
  const zones = [];
  let prefix = null;
  for (const token of header.replace(/\s+/g, "").split("-")) {
    if (/^\d{6}$/.test(token)) break; // the expiry time ends the list
    const m = /^([A-Z]{2}[ZC])?(\d{3})(?:>(\d{3}))?$/.exec(token);
    if (!m) continue;
    if (m[1]) prefix = m[1];
    if (!prefix) continue;
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    for (let n = from; n <= to; n++) zones.push(prefix + String(n).padStart(3, "0"));
  }
  return zones;
}

function segmentFor(product, zones, vtec) {
  if (!product) return null;
  for (const segment of product.split("$$")) {
    const header = /(?:^|\n)([A-Z]{2}[ZC]\d{3}[\s\S]*?\d{6}-)/.exec(segment);
    if (!header) continue;
    const covered = expandUgc(header[1]);
    if (zones.some((z) => covered.includes(z)) && (!vtec || segment.includes(vtec))) return segment;
  }
  return null;
}

// product id per (county, event, onset), from the zone archives.
const products = new Map();
for (const file of readdirSync(DIR).filter((f) => /^NHZ\d{3}\.json$/.test(f))) {
  const zone = file.replace(".json", "");
  for (const e of JSON.parse(readFileSync(path.join(DIR, file), "utf-8")).events) {
    if (!QUALIFYING.has(`${e.phenomena}.${e.significance}`) || !e.product_id) continue;
    const key = `${ZONE_COUNTY[zone]}|${e.name}|${new Date(e.issue).toISOString()}`;
    if (!products.has(key)) products.set(key, e.product_id);
  }
}

const labeled = readFileSync(path.join(DIR, "events-labeled.csv"), "utf-8").trim().split("\n").slice(1).map((l) => {
  const [fips, , event, onset] = l.match(/("[^"]*"|[^,]+)/g);
  return { fips, event: event.replace(/"/g, ""), onset };
});

const raw = existsSync(RAW) ? JSON.parse(readFileSync(RAW, "utf-8")) : {};
const done = {};
let fetched = 0;
let missing = 0;
for (const ev of labeled) {
  const key = `${ev.fips}|${ev.event}|${ev.onset}`;
  const pid = products.get(key);
  if (!pid) {
    missing++;
    continue;
  }
  if (raw[key] == null) {
    try {
      const res = await fetch(`https://mesonet.agron.iastate.edu/api/1/nwstext/${pid}`, { signal: AbortSignal.timeout(20_000) });
      raw[key] = res.ok ? await res.text() : "";
      fetched++;
      if (fetched % 50 === 0) {
        writeFileSync(RAW, JSON.stringify(raw));
        console.log(`${fetched} fetched…`);
      }
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      raw[key] = "";
    }
  }
  // One bulletin carries several segments, each for its own zones and often a
  // different hazard. Read the amounts from the segment that names this
  // county's zones and this event; fall back to the whole bulletin.
  const text = segmentFor(raw[key], COUNTY_ZONES[ev.fips] ?? [], VTEC_CODE[ev.event]) ?? raw[key];
  done[key] = { productId: pid, ...parseHazardText(text, ev.event) };
}
writeFileSync(RAW, JSON.stringify(raw));
writeFileSync(OUT, JSON.stringify(done, null, 1));
const vals = Object.values(done);
console.log(`${fetched} fetched this run, ${missing} without a product id, ${vals.length} total`);
console.log(`ice found in ${vals.filter((v) => v.iceIn != null).length}, gusts in ${vals.filter((v) => v.gustMph != null).length}, snow in ${vals.filter((v) => v.snowIn != null).length}`);
