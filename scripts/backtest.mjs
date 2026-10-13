// AI-assisted: written with Claude Code from the team's build spec.
// Backtest against ten winters of real NWS warnings for every NH forecast
// zone (Iowa Environmental Mesonet VTEC archive, 2016-07 to 2026-07).
//
// It answers two questions a judge will ask:
//   1. How often would a household's watch arm? (warnings per winter, hours under warning)
//   2. How much notice does the storm prompt get? (issue time to hazard onset)
// It does NOT measure outage detection accuracy: that needs outage ground
// truth (see docs/backtest.md). Run: node scripts/backtest.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = "data/backtest";
// The same events the live poller keeps (src/lib/engine/rules.ts).
const QUALIFYING = new Set(["WS.W", "IS.W", "HW.W", "BZ.W", "WI.Y"]);
const ZONE_NAMES = {
  NHZ001: "Northern Coos", NHZ002: "Southern Coos", NHZ003: "Northern Grafton", NHZ004: "Northern Carroll",
  NHZ005: "Southern Grafton", NHZ006: "Southern Carroll", NHZ007: "Sullivan", NHZ008: "Merrimack",
  NHZ009: "Belknap", NHZ010: "Strafford", NHZ011: "Cheshire", NHZ012: "Eastern Hillsborough",
  NHZ013: "Interior Rockingham", NHZ014: "Coastal Rockingham", NHZ015: "Western and Central Hillsborough",
};
// Carroll, Belknap, Strafford, Rockingham, eastern Hillsborough: the district.
const NH01 = new Set(["NHZ004", "NHZ006", "NHZ009", "NHZ010", "NHZ012", "NHZ013", "NHZ014"]);

// A winter runs July to June and is named for the year it ends.
const season = (iso) => {
  const d = new Date(iso);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
};
const hours = (a, b) => (new Date(b) - new Date(a)) / 3_600_000;
const median = (xs) => {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

const zones = {};
const all = [];
for (const file of readdirSync(DIR).filter((f) => /^NHZ\d{3}\.json$/.test(f))) {
  const zone = file.replace(".json", "");
  const events = JSON.parse(readFileSync(path.join(DIR, file), "utf-8")).events;
  const warnings = events
    .filter((e) => QUALIFYING.has(`${e.phenomena}.${e.significance}`))
    .map((e) => {
      // The archive's "issue" is when the hazard begins (VTEC start), and the
      // product id carries the bulletin's transmission time: YYYYMMDDHHMM.
      const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})-/.exec(e.product_id ?? "");
      const sent = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z` : null;
      return {
        zone,
        event: e.name,
        sent,
        onset: e.issue,
        expires: e.expire,
        leadHours: sent ? Math.max(0, hours(sent, e.issue)) : null,
        durationHours: hours(e.issue, e.expire),
        season: season(e.issue),
      };
    })
    // The same VTEC event can appear once per product update; keep one per onset.
    .filter((w, i, arr) => arr.findIndex((o) => o.onset === w.onset && o.event === w.event) === i);
  zones[zone] = warnings;
  all.push(...warnings);
}

const seasons = [...new Set(all.map((w) => w.season))].sort();
const perZone = Object.entries(zones)
  .map(([zone, ws]) => {
    const n = seasons.length;
    const byEvent = {};
    for (const w of ws) byEvent[w.event] = (byEvent[w.event] ?? 0) + 1;
    return {
      zone,
      name: ZONE_NAMES[zone],
      nh01: NH01.has(zone),
      warnings: ws.length,
      perWinter: r1(ws.length / n),
      hoursUnderWarningPerWinter: r1(ws.reduce((s, w) => s + w.durationHours, 0) / n),
      medianLeadHours: r1(median(ws.map((w) => w.leadHours).filter((x) => x != null))),
      medianDurationHours: r1(median(ws.map((w) => w.durationHours))),
      byEvent,
    };
  })
  .sort((a, b) => a.zone.localeCompare(b.zone));

const leads = all.map((w) => w.leadHours).filter((x) => x != null);
const durations = all.map((w) => w.durationHours);
const perSeason = seasons.map((s) => ({
  season: `${s - 1}-${String(s).slice(2)}`,
  warnings: all.filter((w) => w.season === s).length,
  carroll: all.filter((w) => w.season === s && w.zone === "NHZ006").length,
}));

// Prompts go to the resident only for warnings, not advisories.
const PROMPT = new Set(["Winter Storm Warning", "Ice Storm Warning", "High Wind Warning", "Blizzard Warning"]);
const prompts = all.filter((w) => PROMPT.has(w.event));
const promptLeads = prompts.map((w) => w.leadHours).filter((x) => x != null);

const summary = {
  source: "Iowa Environmental Mesonet VTEC archive (NWS Gray ME and Burlington VT products), zones NHZ001-NHZ015, 2016-07-01 to 2026-07-01",
  qualifyingEvents: [...QUALIFYING],
  winters: seasons.length,
  totalWarnings: all.length,
  byEvent: all.reduce((acc, w) => ((acc[w.event] = (acc[w.event] ?? 0) + 1), acc), {}),
  lead: { medianHours: r1(median(leads)), p10Hours: r1(pct(leads, 10)), p90Hours: r1(pct(leads, 90)), underOneHour: leads.filter((x) => x < 1).length, atLeastSixHours: leads.filter((x) => x >= 6).length },
  duration: { medianHours: r1(median(durations)), p90Hours: r1(pct(durations, 90)) },
  prompts: {
    total: prompts.length,
    perZonePerWinter: r1(prompts.length / Object.keys(zones).length / seasons.length),
    nh01PerZonePerWinter: r1(prompts.filter((w) => NH01.has(w.zone)).length / NH01.size / seasons.length),
    medianLeadHours: r1(median(promptLeads)),
    atLeastSixHours: promptLeads.filter((x) => x >= 6).length,
  },
  nh01: {
    zones: [...NH01],
    warningsPerZonePerWinter: r1(all.filter((w) => NH01.has(w.zone)).length / NH01.size / seasons.length),
    hoursUnderWarningPerZonePerWinter: r1(all.filter((w) => NH01.has(w.zone)).reduce((s, w) => s + w.durationHours, 0) / NH01.size / seasons.length),
  },
  perSeason,
  perZone,
};

writeFileSync(path.join(DIR, "summary.json"), JSON.stringify(summary, null, 2));
writeFileSync(path.join(DIR, "warnings.csv"), ["zone,event,sent,onset,expires,lead_hours,duration_hours,season", ...all.map((w) => [w.zone, JSON.stringify(w.event), w.sent, w.onset, w.expires, r1(w.leadHours), r1(w.durationHours), w.season].join(","))].join("\n"));

console.log(`${all.length} qualifying warnings across ${Object.keys(zones).length} zones and ${seasons.length} winters`);
console.log("By event:", summary.byEvent);
console.log(`Lead time (bulletin to hazard onset): median ${summary.lead.medianHours} h, p10 ${summary.lead.p10Hours} h, p90 ${summary.lead.p90Hours} h; ${summary.lead.underOneHour} under 1 h, ${summary.lead.atLeastSixHours} at least 6 h`);
console.log(`Duration: median ${summary.duration.medianHours} h, p90 ${summary.duration.p90Hours} h`);
console.log(`Storm prompts (warnings only): ${prompts.length}; ${summary.prompts.nh01PerZonePerWinter} per NH-01 zone per winter; median lead ${summary.prompts.medianLeadHours} h; ${summary.prompts.atLeastSixHours} with 6 h or more`);
console.log(`NH-01 zones: ${summary.nh01.warningsPerZonePerWinter} arming events and ${summary.nh01.hoursUnderWarningPerZonePerWinter} h under warning per zone per winter`);
console.table(perZone.map(({ zone, name, nh01, warnings, perWinter, hoursUnderWarningPerWinter, medianLeadHours, medianDurationHours }) => ({ zone, name, nh01, warnings, perWinter, hoursUnderWarningPerWinter, medianLeadHours, medianDurationHours })));
console.table(perSeason);
