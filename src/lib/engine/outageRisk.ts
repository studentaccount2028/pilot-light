// AI-assisted: written with Claude Code from the team's build spec.
// Outage-risk model inference. The model is a logistic regression trained by
// scripts/train-outage-model.mjs on NWS events joined to DOE EAGLE-I outage
// records; its weights ship in src/data/outage-model.json. The feature list
// here must build exactly what the trainer built, in the order of
// model.names, so the names drive the computation.
import model from "../../data/outage-model.json";
import { parseHazardText } from "./hazardText";

// Forecast zone -> county name, the model's geography.
export const ZONE_COUNTY: Record<string, string> = {
  NHZ001: "Coos", NHZ002: "Coos", NHZ003: "Grafton", NHZ005: "Grafton", NHZ004: "Carroll", NHZ006: "Carroll",
  NHZ007: "Sullivan", NHZ008: "Merrimack", NHZ009: "Belknap", NHZ010: "Strafford", NHZ011: "Cheshire",
  NHZ012: "Hillsborough", NHZ015: "Hillsborough", NHZ013: "Rockingham", NHZ014: "Rockingham",
};

export interface RiskInput {
  event: string;
  zone: string;
  onset: Date;
  expires: Date;
  description?: string | null;
}

export interface OutageRisk {
  probability: number; // 0..1
  // The factors that pushed it, largest first, for the "why" line.
  drivers: { name: string; contribution: number }[];
  auc: number;
  baseRate: number;
  source: string;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function featureValue(name: string, i: RiskInput, text: ReturnType<typeof parseHazardText>): number {
  if (name === "intercept") return 1;
  if (name.startsWith("event:")) return i.event === name.slice(6) ? 1 : 0;
  if (name.startsWith("county:")) return ZONE_COUNTY[i.zone] === name.slice(7) ? 1 : 0;
  const month = ((i.onset.getUTCMonth() / 12) * 2 * Math.PI);
  switch (name) {
    case "duration_h/24":
      return Math.max(0, i.expires.getTime() - i.onset.getTime()) / 3_600_000 / 24;
    case "month_sin":
      return Math.sin(month);
    case "month_cos":
      return Math.cos(month);
    case "night_onset": {
      const h = i.onset.getUTCHours();
      return h >= 22 || h < 10 ? 1 : 0;
    }
    case "ice_in":
      return text.iceIn ?? 0;
    case "ice_known":
      return text.iceIn != null ? 1 : 0;
    case "gust_mph/10":
      return (text.gustMph ?? 0) / 10;
    case "gust_known":
      return text.gustMph != null ? 1 : 0;
    case "snow_in/10":
      return (text.snowIn ?? 0) / 10;
    default:
      return 0;
  }
}

export function modelShipped(): boolean {
  return Boolean(model.shipped);
}

export function outageRisk(input: RiskInput): OutageRisk | null {
  if (!model.shipped || !ZONE_COUNTY[input.zone]) return null;
  const text = parseHazardText(input.description ?? "", input.event);
  const terms = model.names.map((name, k) => ({ name, contribution: model.weights[k] * featureValue(name, input, text) }));
  const z = terms.reduce((s, t) => s + t.contribution, 0);
  const drivers = terms
    .filter((t) => t.name !== "intercept" && Math.abs(t.contribution) > 0.05)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 4);
  return { probability: sigmoid(z), drivers, auc: model.cvAuc, baseRate: model.baseRate, source: model.source };
}

// "a Winter Storm Warning lasting 19 hours in Carroll County, with up to half an inch of ice"
export function describeDrivers(risk: OutageRisk): string {
  const names: Record<string, string> = {
    "duration_h/24": "how long the warning lasts",
    ice_in: "the forecast ice",
    "gust_mph/10": "the forecast wind gusts",
    "snow_in/10": "the forecast snow",
    month_cos: "the time of year",
    month_sin: "the time of year",
    night_onset: "an overnight start",
  };
  const parts = risk.drivers.map((d) => (d.name.startsWith("county:") ? `${d.name.slice(7)} County's record` : d.name.startsWith("event:") ? `the kind of alert` : names[d.name] ?? d.name)).filter((p, i, a) => a.indexOf(p) === i);
  return parts.length ? `Based mostly on ${parts.slice(0, 3).join(", ")}.` : "";
}
