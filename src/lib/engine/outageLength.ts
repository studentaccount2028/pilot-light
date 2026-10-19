// AI-assisted: written with Claude Code from the team's forecast spec.
// "The race": how long will homes stay dark, and will Mom's battery last?
//
// The model is gradient-boosted survival regression (XGBoost, accelerated failure
// time) trained by ml/train.py on DOE EAGLE-I outages, NWS events, station weather
// and roadside tree canopy; ml/export.py ships its trees in
// src/data/outage-length-model.json and checks this exact walk against XGBoost.
//
// It is asked one hour into an outage, when the first hour shows how fast the
// outage is spreading, the strongest signal in the data. Its answer is for a
// typical affected home in the county, not a specific house: say so wherever it shows.
import model from "../../data/outage-length-model.json";
import { parseHazardText } from "./hazardText";
import { ZONE_COUNTY } from "./outageRisk";

export interface LengthInput {
  event: string;
  zone: string;
  onset: Date;
  expires: Date;
  description?: string | null;
  outageStart: Date;
  shareOutAtStart: number; // county customers out at the start, as a share of all customers
  shareOutAt1h: number; // the most out within the first hour, as a share
}

export interface Race {
  predictedHours: number; // median time a typical affected home stays dark
  low: number; // 10th percentile
  high: number; // 90th percentile
  batteryHours: number;
  pDarkOverBattery: number; // chance the outage outlasts the battery
  cIndex: number;
  source: string;
}

type Tree = { l: number[]; r: number[]; f: number[]; c: number[]; d: number[] };
const TREES = model.trees as Tree[];
const f32 = Math.fround;

// Walk every tree for a feature vector (null = missing) and return the predicted median hours.
export function predictHours(x: (number | null)[]): number {
  let margin = Math.log(model.baseScore);
  for (const t of TREES) {
    let n = 0;
    while (t.l[n] !== -1) {
      const v = x[t.f[n]];
      if (v == null || Number.isNaN(v)) n = t.d[n] ? t.l[n] : t.r[n];
      else n = f32(v) < f32(t.c[n]) ? t.l[n] : t.r[n];
    }
    margin += t.c[n];
  }
  return Math.exp(margin);
}

// The same columns the trainer built (ml/build_features.py), by name.
export function lengthFeatures(i: LengthInput): Record<string, number | null> {
  const county = ZONE_COUNTY[i.zone];
  const canopy = (model.roadsideCanopy as Record<string, { pct: number; heavyShare: number }>)[county];
  const text = parseHazardText(i.description ?? "", i.event);
  const m = (i.onset.getUTCMonth() / 12) * 2 * Math.PI;
  const h = i.onset.getUTCHours();
  return {
    ev_winter_storm: i.event === "Winter Storm Warning" ? 1 : 0,
    ev_high_wind: i.event === "High Wind Warning" ? 1 : 0,
    ev_blizzard_warning: i.event === "Blizzard Warning" ? 1 : 0,
    ev_wind_advisory: i.event === "Wind Advisory" ? 1 : 0,
    duration_hours: (i.expires.getTime() - i.onset.getTime()) / 3_600_000,
    month_sin: Math.sin(m),
    month_cos: Math.cos(m),
    night_onset: h >= 2 && h < 14 ? 1 : 0,
    fc_iceIn: text.iceIn,
    fc_snowIn: text.snowIn,
    fc_gustMph: text.gustMph,
    roadside_canopy_pct: canopy?.pct ?? null,
    heavily_treed_share: canopy?.heavyShare ?? null,
    o_share_1h: i.shareOutAt1h,
    o_growth_1h: i.shareOutAt1h - i.shareOutAtStart,
    o_start_hour_utc: i.outageStart.getUTCHours(),
  };
}

// standard normal CDF (Abramowitz and Stegun 7.1.26), plenty for a percentage on screen
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function race(i: LengthInput, batteryHours: number): Race | null {
  if (!ZONE_COUNTY[i.zone]) return null;
  const feats = lengthFeatures(i);
  const median = predictHours(model.features.map((name) => feats[name] ?? null));
  // log(dark hours) ~ Normal(log(median), sigma), sigma measured on held-out folds
  const s = model.sigma;
  return {
    predictedHours: median,
    low: median * Math.exp(-1.2816 * s),
    high: median * Math.exp(1.2816 * s),
    batteryHours,
    pDarkOverBattery: batteryHours <= 0 ? 1 : 1 - phi((Math.log(batteryHours) - Math.log(median)) / s),
    cIndex: model.metrics.cIndex,
    source: "Typical affected home in the county, from 7 years of NH outages (DOE EAGLE-I)",
  };
}
