// AI-assisted: written with Claude Code from the team's build spec.
// Outage-risk model: P(an outage episode begins during this NWS event).
// Logistic regression in plain JavaScript on data/backtest/events-labeled.csv
// (one row per county-level arming event, 2023-2025, labelled from DOE
// EAGLE-I). Small data, so the model is small and every weight is printed.
// Reports 5-fold cross-validated AUC and calibration, and only writes the
// model for the app if the AUC clears a bar. Run: node scripts/train-outage-model.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const rows = readFileSync("data/backtest/events-labeled.csv", "utf-8").trim().split("\n").slice(1).map((l) => {
  const [fips, county, event, onset, duration, month, hour, outage, peak] = l.match(/("[^"]*"|[^,]+)/g);
  return { fips, county, event: event.replace(/"/g, ""), onset, duration: Number(duration), month: Number(month), hour: Number(hour), y: Number(outage), peak: Number(peak) };
});

// Forecast amounts read from each bulletin (scripts/fetch-event-text.mjs).
const text = existsSync("data/backtest/events-text.json") ? JSON.parse(readFileSync("data/backtest/events-text.json", "utf-8")) : {};
for (const r of rows) {
  const t = text[`${r.fips}|${r.event}|${r.onset}`] ?? {};
  r.iceIn = t.iceIn ?? null;
  r.gustMph = t.gustMph ?? null;
  r.snowIn = t.snowIn ?? null;
}
const withText = rows.filter((r) => r.iceIn != null || r.gustMph != null || r.snowIn != null).length;

const EVENTS = ["Winter Storm Warning", "High Wind Warning", "Blizzard Warning", "Wind Advisory"];
const COUNTIES = [...new Set(rows.map((r) => r.county))].sort();
// Feature names, in order. Intercept first.
const NAMES = ["intercept", ...EVENTS.map((e) => `event:${e}`), ...COUNTIES.map((c) => `county:${c}`), "duration_h/24", "month_sin", "month_cos", "night_onset", "ice_in", "ice_known", "gust_mph/10", "gust_known", "snow_in/10"];

function features(r) {
  const m = ((r.month - 1) / 12) * 2 * Math.PI;
  return [1, ...EVENTS.map((e) => (r.event === e ? 1 : 0)), ...COUNTIES.map((c) => (r.county === c ? 1 : 0)), r.duration / 24, Math.sin(m), Math.cos(m), r.hour >= 22 || r.hour < 10 ? 1 : 0, r.iceIn ?? 0, r.iceIn != null ? 1 : 0, (r.gustMph ?? 0) / 10, r.gustMph != null ? 1 : 0, (r.snowIn ?? 0) / 10];
}
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const dot = (w, x) => w.reduce((s, wi, i) => s + wi * x[i], 0);

// Gradient descent with L2 so the one-hot columns on 362 rows do not run away.
function train(data, { steps = 4000, lr = 0.05, l2 = 0.02 } = {}) {
  const w = new Array(NAMES.length).fill(0);
  for (let s = 0; s < steps; s++) {
    const g = new Array(w.length).fill(0);
    for (const { x, y } of data) {
      const err = sigmoid(dot(w, x)) - y;
      for (let i = 0; i < w.length; i++) g[i] += err * x[i];
    }
    for (let i = 0; i < w.length; i++) w[i] -= (lr * (g[i] / data.length + (i === 0 ? 0 : l2 * w[i])));
  }
  return w;
}

function auc(pairs) {
  const pos = pairs.filter((p) => p.y === 1).map((p) => p.p);
  const neg = pairs.filter((p) => p.y === 0).map((p) => p.p);
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

const data = rows.map((r) => ({ x: features(r), y: r.y, storm: r.onset.slice(0, 10) }));
// Folds are split by storm (onset date), not by row. One storm produces a
// row in every county it touches; putting some of those in training and some
// in the test fold would let the model recognise the storm and flatter the score.
let seed = 7;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const storms = [...new Set(data.map((d) => d.storm))].map((storm) => ({ storm, k: rnd() })).sort((a, b) => a.k - b.k).map((o) => o.storm);
const K = 5;
const foldOf = new Map(storms.map((storm, i) => [storm, i % K]));
const held = [];
for (let f = 0; f < K; f++) {
  const test = data.filter((d) => foldOf.get(d.storm) === f);
  const trainSet = data.filter((d) => foldOf.get(d.storm) !== f);
  const w = train(trainSet);
  for (const t of test) held.push({ y: t.y, p: sigmoid(dot(w, t.x)) });
}
const cvAuc = auc(held);
const brier = held.reduce((s, h) => s + (h.p - h.y) ** 2, 0) / held.length;
const base = rows.filter((r) => r.y).length / rows.length;
const baseBrier = base * (1 - base);

// Calibration: predicted vs observed by quintile of predicted risk.
const sorted = held.slice().sort((a, b) => a.p - b.p);
const bins = [0, 1, 2, 3, 4].map((b) => {
  const slice = sorted.slice(Math.floor((b * sorted.length) / 5), Math.floor(((b + 1) * sorted.length) / 5));
  return { quintile: b + 1, n: slice.length, predicted: Math.round((100 * slice.reduce((s, h) => s + h.p, 0)) / slice.length), observed: Math.round((100 * slice.reduce((s, h) => s + h.y, 0)) / slice.length) };
});

const w = train(data);
const weights = Object.fromEntries(NAMES.map((n, i) => [n, Math.round(w[i] * 1000) / 1000]));

console.log(`${rows.length} events, ${rows.filter((r) => r.y).length} followed by an outage (base rate ${Math.round(base * 100)}%); bulletin amounts parsed for ${withText}`);
console.log(`${storms.length} distinct storms. 5-fold CV grouped by storm: AUC ${cvAuc.toFixed(3)}; Brier ${brier.toFixed(3)} vs ${baseBrier.toFixed(3)} for always predicting the base rate`);
console.table(bins);
console.log("Weights (log-odds):");
console.table(Object.entries(weights).map(([feature, weight]) => ({ feature, weight })));

const BAR = 0.65;
const model = {
  trainedAt: new Date().toISOString().slice(0, 10),
  source: "DOE/ORNL EAGLE-I county outages 2023-2025 joined to NWS events (IEM VTEC archive)",
  rows: rows.length,
  rowsWithBulletinAmounts: withText,
  positives: rows.filter((r) => r.y).length,
  storms: storms.length,
  cvAuc: Math.round(cvAuc * 1000) / 1000,
  cvMethod: "5-fold, grouped by storm (onset date)",
  brier: Math.round(brier * 1000) / 1000,
  baseRate: Math.round(base * 1000) / 1000,
  calibration: bins,
  events: EVENTS,
  counties: COUNTIES,
  names: NAMES,
  weights: w.map((x) => Math.round(x * 10000) / 10000),
  shipped: cvAuc >= BAR,
};
writeFileSync("src/data/outage-model.json", JSON.stringify(model, null, 2));
console.log(cvAuc >= BAR ? `AUC clears ${BAR}: model written to src/data/outage-model.json and used by the app.` : `AUC below ${BAR}: model written for the record but marked shipped: false, so the app does not show it.`);
