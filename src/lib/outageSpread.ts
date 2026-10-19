// AI-assisted: written with Claude Code from the team's forecast spec.
// The first hour of a county outage, the strongest input to the race model.
// The replayed storm uses the real DOE EAGLE-I record. A live feed from the
// utilities' outage counts plugs in here; until it does, live storms return
// null and the app does not show the race.
import spread from "../data/outage-spread.json";

export interface Spread {
  county: string;
  outageStart: Date;
  shareOutAtStart: number;
  shareOutAt1h: number;
  source: string;
}

export function spreadFor(alertId: string | null | undefined): Spread | null {
  const s = alertId ? (spread as Record<string, { county: string; outageStart: string; shareOutAtStart: number; shareOutAt1h: number; source: string } | string>)[alertId] : undefined;
  if (!s || typeof s === "string") return null;
  return { ...s, outageStart: new Date(s.outageStart) };
}
