// AI-assisted: written with Claude Code from the team's build spec.
// Joins the warning backtest to real outages: DOE EAGLE-I county outage
// counts (15-minute, New Hampshire rows only) against the NWS warnings in
// data/backtest/warnings.csv. Answers:
//   1. Coverage: of real outage episodes, how many began while a qualifying
//      warning was in force (so the watch would have been armed)?
//   2. Yield: of warnings, how many were followed by an outage?
// Run after `npm run backtest`:  node scripts/backtest-outages.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = "data/backtest";
// Forecast zone -> county FIPS. Zones split counties north/south; both halves map to the county.
const ZONE_COUNTY = {
  NHZ001: "33007", NHZ002: "33007", NHZ003: "33009", NHZ005: "33009", NHZ004: "33003", NHZ006: "33003",
  NHZ007: "33019", NHZ008: "33013", NHZ009: "33001", NHZ010: "33017", NHZ011: "33005",
  NHZ012: "33011", NHZ015: "33011", NHZ013: "33015", NHZ014: "33015",
};
const COUNTY_NAME = { "33001": "Belknap", "33003": "Carroll", "33005": "Cheshire", "33007": "Coos", "33009": "Grafton", "33011": "Hillsborough", "33013": "Merrimack", "33015": "Rockingham", "33017": "Strafford", "33019": "Sullivan" };
// An "outage episode": the county's customers-out stays at or above this share
// of its customers for at least an hour. Big enough to be a storm, not a
// single transformer.
const EPISODE_SHARE = 0.02;
const EPISODE_MIN_MS = 60 * 60_000;
const GAP_MS = 3 * 60 * 60_000; // readings this far apart end an episode
const LOOKAHEAD_MS = 6 * 60 * 60_000; // outage can start this long after the warning ends

const csv = (file) => readFileSync(path.join(DIR, file), "utf-8").trim().split("\n").slice(1).map((l) => l.split(","));

// Customers per county (modeled customer count), to turn counts into shares.
const customers = {};
for (const row of csv("MCC.csv")) {
  const fips = row.find((c) => /^33\d{3}$/.test(c));
  const n = Number(row[row.length - 1]);
  if (fips && Number.isFinite(n) && n > 0) customers[fips] = Math.max(customers[fips] ?? 0, n);
}

// Outage readings per county, sorted by time.
const readings = {};
const years = [];
for (const file of readdirSync(DIR).filter((f) => /^eaglei_nh_\d{4}\.csv$/.test(f)).sort()) {
  years.push(file.match(/\d{4}/)[0]);
  for (const [fips, , , out, at] of csv(file)) {
    if (!out) continue;
    (readings[fips] ??= []).push({ t: Date.parse(at.replace(" ", "T") + "Z"), out: Number(out) });
  }
}
for (const list of Object.values(readings)) list.sort((a, b) => a.t - b.t);

// Episodes: runs of readings at or above the threshold.
const episodes = [];
for (const [fips, list] of Object.entries(readings)) {
  const threshold = (customers[fips] ?? Infinity) * EPISODE_SHARE;
  let cur = null;
  for (const r of list) {
    if (r.out >= threshold && (!cur || r.t - cur.end <= GAP_MS)) {
      cur ??= { fips, start: r.t, end: r.t, peak: 0 };
      cur.end = r.t;
      cur.peak = Math.max(cur.peak, r.out);
    } else if (cur) {
      if (cur.end - cur.start >= EPISODE_MIN_MS) episodes.push(cur);
      cur = r.out >= threshold ? { fips, start: r.t, end: r.t, peak: r.out } : null;
    }
  }
  if (cur && cur.end - cur.start >= EPISODE_MIN_MS) episodes.push(cur);
}

// Warnings, limited to the years we have outage data for.
const warnings = csv("warnings.csv")
  .map(([zone, event, , onset, expires]) => ({ zone, event: event.replace(/"/g, ""), fips: ZONE_COUNTY[zone], onset: Date.parse(onset), expires: Date.parse(expires) }))
  .filter((w) => years.includes(String(new Date(w.onset).getUTCFullYear())) || years.includes(String(new Date(w.expires).getUTCFullYear())));

const underWarning = (fips, t) => warnings.some((w) => w.fips === fips && w.onset <= t && t <= w.expires);
const withinWindowOfWarning = (fips, t) => warnings.some((w) => w.fips === fips && w.onset - 60 * 60_000 <= t && t <= w.expires + LOOKAHEAD_MS);

const inYears = (t) => years.includes(String(new Date(t).getUTCFullYear()));
const eps = episodes.filter((e) => inYears(e.start));
const covered = eps.filter((e) => underWarning(e.fips, e.start));
const near = eps.filter((e) => withinWindowOfWarning(e.fips, e.start));
// Winter episodes only (Nov to Apr): the storms Pilot Light is for.
const winter = eps.filter((e) => [10, 11, 0, 1, 2, 3].includes(new Date(e.start).getUTCMonth()));
const winterCovered = winter.filter((e) => underWarning(e.fips, e.start));

// Dedupe warnings per county: the two zones of one county share an outage record.
const countyWarnings = warnings.filter((w, i, arr) => arr.findIndex((o) => o.fips === w.fips && o.onset === w.onset) === i);
const followed = countyWarnings.filter((w) => episodes.some((e) => e.fips === w.fips && e.start >= w.onset - 60 * 60_000 && e.start <= w.expires + LOOKAHEAD_MS));

// Weighted by customers: share of all peak customers-out that happened under warning.
const totalPeak = eps.reduce((s, e) => s + e.peak, 0);

// Coverage by size: the bigger the outage, the more it matters that the watch was armed.
const bySize = [0.02, 0.05, 0.1, 0.25].map((share) => {
  const big = eps.filter((e) => e.peak >= share * (customers[e.fips] ?? Infinity));
  const bigWinter = big.filter((e) => [10, 11, 0, 1, 2, 3].includes(new Date(e.start).getUTCMonth()));
  return {
    peakAtLeast: `${share * 100}% of county`,
    episodes: big.length,
    underWarning: big.filter((e) => underWarning(e.fips, e.start)).length,
    winterEpisodes: bigWinter.length,
    winterUnderWarning: bigWinter.filter((e) => underWarning(e.fips, e.start)).length,
  };
});
const coveredPeak = covered.reduce((s, e) => s + e.peak, 0);

// Ablation: what if the watch also armed on advisories and watches? Coverage
// goes up, and so does the time a household spends on watch. Both are costs
// the design has to weigh, so both are reported.
const ALL_EVENTS = {};
for (const file of readdirSync(DIR).filter((f) => /^NHZ\d{3}\.json$/.test(f))) {
  const zone = file.replace(".json", "");
  for (const e of JSON.parse(readFileSync(path.join(DIR, file), "utf-8")).events) {
    const onset = Date.parse(e.issue);
    const expires = Date.parse(e.expire);
    if (!inYears(onset) && !inYears(expires)) continue;
    (ALL_EVENTS[`${e.phenomena}.${e.significance}`] ??= []).push({ fips: ZONE_COUNTY[zone], onset, expires });
  }
}
const SETS = {
  "warnings only (WS.W, IS.W, HW.W, BZ.W)": ["WS.W", "IS.W", "HW.W", "BZ.W"],
  "current: warnings + Wind Advisory": ["WS.W", "IS.W", "HW.W", "BZ.W", "WI.Y"],
  "+ Winter Weather Advisory": ["WS.W", "IS.W", "HW.W", "BZ.W", "WI.Y", "WW.Y"],
  "+ Winter Storm Watch, High Wind Watch": ["WS.W", "IS.W", "HW.W", "BZ.W", "WI.Y", "WW.Y", "WS.A", "HW.A"],
};
const ablation = Object.entries(SETS).map(([name, codes]) => {
  const evs = codes.flatMap((c) => ALL_EVENTS[c] ?? []);
  const under = (fips, t) => evs.some((w) => w.fips === fips && w.onset <= t && t <= w.expires);
  const big = eps.filter((e) => e.peak >= 0.1 * (customers[e.fips] ?? Infinity));
  // Hours on watch per county per year: union of intervals per county.
  let watchMs = 0;
  for (const fips of Object.keys(COUNTY_NAME)) {
    const iv = evs.filter((w) => w.fips === fips).sort((a, b) => a.onset - b.onset);
    let end = -Infinity;
    for (const w of iv) {
      const start = Math.max(w.onset, end);
      if (w.expires > start) watchMs += w.expires - start;
      end = Math.max(end, w.expires);
    }
  }
  return {
    events: name,
    episodesCovered: `${eps.filter((e) => under(e.fips, e.start)).length} of ${eps.length}`,
    winterCovered: `${winter.filter((e) => under(e.fips, e.start)).length} of ${winter.length}`,
    bigCovered: `${big.filter((e) => under(e.fips, e.start)).length} of ${big.length}`,
    peakShareCovered: Math.round((100 * eps.filter((e) => under(e.fips, e.start)).reduce((s, e) => s + e.peak, 0)) / Math.max(1, totalPeak)) + "%",
    watchHoursPerCountyPerYear: Math.round(watchMs / 3_600_000 / Object.keys(COUNTY_NAME).length / years.length),
  };
});

const hours = (ms) => Math.round((ms / 3_600_000) * 10) / 10;
const result = {
  source: "DOE/ORNL EAGLE-I county outage counts (15 min), New Hampshire rows; years " + years.join(", "),
  episodeDefinition: `customers out >= ${EPISODE_SHARE * 100}% of the county's customers for >= 1 h (gaps up to 3 h bridged)`,
  counties: Object.fromEntries(Object.keys(COUNTY_NAME).map((f) => [COUNTY_NAME[f], customers[f] ?? null])),
  episodes: eps.length,
  episodesUnderWarningAtStart: covered.length,
  episodesWithinWarningWindow: near.length,
  winterEpisodes: winter.length,
  winterEpisodesUnderWarningAtStart: winterCovered.length,
  countyWarnings: countyWarnings.length,
  countyWarningsFollowedByEpisode: followed.length,
  bySize,
  ablation,
  shareOfPeakCustomersOutUnderWarning: Math.round((100 * coveredPeak) / Math.max(1, totalPeak)),
  largestEpisodes: eps
    .sort((a, b) => b.peak - a.peak)
    .slice(0, 12)
    .map((e) => ({ county: COUNTY_NAME[e.fips], start: new Date(e.start).toISOString(), hours: hours(e.end - e.start), peakCustomersOut: e.peak, share: Math.round((e.peak / customers[e.fips]) * 100) + "%", underWarning: underWarning(e.fips, e.start), withinWindow: withinWindowOfWarning(e.fips, e.start) })),
};
writeFileSync(path.join(DIR, "outages-summary.json"), JSON.stringify(result, null, 2));

// Training data for the outage-risk model: one row per county-level arming
// event, labelled 1 if an outage episode began in its window. Peak share is
// the largest episode in the window, for a severity target later.
const labeled = countyWarnings.map((w) => {
  const hits = episodes.filter((e) => e.fips === w.fips && e.start >= w.onset - 60 * 60_000 && e.start <= w.expires + LOOKAHEAD_MS);
  const peak = hits.reduce((m, e) => Math.max(m, e.peak / (customers[e.fips] ?? Infinity)), 0);
  const d = new Date(w.onset);
  return [w.fips, COUNTY_NAME[w.fips], JSON.stringify(w.event), new Date(w.onset).toISOString(), hours(w.expires - w.onset), d.getUTCMonth() + 1, d.getUTCHours(), hits.length > 0 ? 1 : 0, Math.round(peak * 1000) / 1000].join(",");
});
writeFileSync(path.join(DIR, "events-labeled.csv"), ["fips,county,event,onset,duration_hours,month,hour_utc,outage,peak_share", ...labeled].join("\n"));
console.log(`Wrote ${labeled.length} labelled events (${labeled.filter((l) => l.split(",").slice(-2)[0] === "1").length} followed by an outage) to events-labeled.csv`);

console.log(result.source);
console.log(`Episodes (${result.episodeDefinition}): ${eps.length}`);
console.log(`  under a qualifying warning when they began: ${covered.length} (${Math.round((100 * covered.length) / Math.max(1, eps.length))}%)`);
console.log(`  within 1 h before to 6 h after a warning: ${near.length} (${Math.round((100 * near.length) / Math.max(1, eps.length))}%)`);
console.log(`Winter episodes (Nov-Apr): ${winter.length}, under warning at start: ${winterCovered.length} (${Math.round((100 * winterCovered.length) / Math.max(1, winter.length))}%)`);
console.log(`County-level warnings: ${countyWarnings.length}, followed by an episode: ${followed.length} (${Math.round((100 * followed.length) / Math.max(1, countyWarnings.length))}%)`);
console.log(`Share of peak customers-out that happened under warning: ${result.shareOfPeakCustomersOutUnderWarning}%`);
console.table(bySize);
console.table(ablation);
console.table(result.largestEpisodes);
