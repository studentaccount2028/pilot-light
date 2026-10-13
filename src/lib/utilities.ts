// AI-assisted: written with Claude Code from the team's build spec.
import data from "../data/utilities.json";
import type { Utility } from "../db/schema";

export interface UtilityInfo {
  name: string;
  outageMapUrl: string | null;
  lifeSupportUrl: string | null;
  lifeSupportPhone: string | null;
  lifeSupportNote: string;
}

export const UTILITIES = data.utilities as Record<Utility, UtilityInfo>;
const TOWNS = data.towns as Record<string, { utility: Utility; verified: boolean }>;

export function utilityForTown(town: string): { utility: Utility; verified: boolean } | null {
  const key = Object.keys(TOWNS).find((t) => t.toLowerCase() === town.trim().toLowerCase());
  return key ? TOWNS[key] : null;
}
