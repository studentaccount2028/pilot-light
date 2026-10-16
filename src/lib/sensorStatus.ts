// AI-assisted: written with Claude Code from the team's build spec.
// Turns a power module's latest reading into what the family sees, like a
// smart plug app: is the wall on, is the battery charging, how much is left,
// how long it will last, and whether the battery is wearing out. Pure, so the
// tests and the screen use the same rules.

export interface ReadingLike {
  at: Date | string;
  mains: boolean | null;
  mainsVolts: number | null;
  charging: boolean | null;
  batteryPct: number | null;
  batteryVolts: number | null;
  capacityWh: number | null;
  healthPct: number | null;
  cycles: number | null;
  outputWatts: number | null;
  tempC: number | null;
  signalDbm: number | null;
  simulated?: boolean;
}

// A module that has not reported for this long is "not reporting".
export const STALE_MS = 15 * 60_000;

// Lithium cells are normally retired at 80% of their original capacity, and
// typical packs reach that around 500 full cycles.
export const REPLACE_SOON_HEALTH = 80;
export const REPLACE_NOW_HEALTH = 70;
export const REPLACE_SOON_CYCLES = 500;
export const HOT_C = 45;

export type Replace = "good" | "soon" | "now" | "unknown";

export interface ModuleStatus {
  reporting: boolean;
  wall: "on" | "off" | "unknown";
  wallText: string;
  chargeText: string; // Charging / Full / On battery / Not charging
  batteryPct: number | null;
  // Hours the battery can run the device at the current draw, if known.
  hoursLeft: number | null;
  health: number | null;
  replace: Replace;
  replaceText: string;
  warnings: string[];
  signal: "strong" | "fair" | "weak" | "none" | null;
}

function signalOf(dbm: number | null): ModuleStatus["signal"] {
  if (dbm == null) return null;
  if (dbm >= -85) return "strong";
  if (dbm >= -100) return "fair";
  if (dbm >= -112) return "weak";
  return "none";
}

// State of health if the module reports it; otherwise estimated from cycle
// count on a straight line from 100% new to 80% at 500 cycles.
export function healthOf(r: Pick<ReadingLike, "healthPct" | "cycles">): number | null {
  if (r.healthPct != null) return Math.max(0, Math.min(100, r.healthPct));
  if (r.cycles != null) return Math.max(0, Math.round(100 - (r.cycles / REPLACE_SOON_CYCLES) * (100 - REPLACE_SOON_HEALTH)));
  return null;
}

export function replaceOf(health: number | null, cycles: number | null): Replace {
  if (health == null && cycles == null) return "unknown";
  if (health != null && health < REPLACE_NOW_HEALTH) return "now";
  if ((health != null && health < REPLACE_SOON_HEALTH) || (cycles != null && cycles >= REPLACE_SOON_CYCLES)) return "soon";
  return "good";
}

export function hoursLeft(r: Pick<ReadingLike, "batteryPct" | "capacityWh" | "healthPct" | "cycles" | "outputWatts">): number | null {
  if (r.batteryPct == null || r.capacityWh == null || r.outputWatts == null || r.outputWatts <= 0.5) return null;
  // A worn battery holds less than its label says.
  const health = healthOf(r) ?? 100;
  const wh = r.capacityWh * (health / 100) * (r.batteryPct / 100);
  return wh / r.outputWatts;
}

export function moduleStatus(r: ReadingLike | null, now: Date): ModuleStatus {
  if (!r) {
    return { reporting: false, wall: "unknown", wallText: "No reports yet", chargeText: "Unknown", batteryPct: null, hoursLeft: null, health: null, replace: "unknown", replaceText: "Not known yet", warnings: [], signal: null };
  }
  const at = typeof r.at === "string" ? new Date(r.at) : r.at;
  const reporting = now.getTime() - at.getTime() < STALE_MS;
  const wall = r.mains == null ? "unknown" : r.mains ? "on" : "off";
  const wallText = wall === "on" ? `On${r.mainsVolts != null ? ` · ${Math.round(r.mainsVolts)} V` : ""}` : wall === "off" ? "Off" : "Unknown";

  let chargeText = "Unknown";
  if (r.mains === false) chargeText = "On battery";
  else if (r.charging === true) chargeText = "Charging";
  else if (r.batteryPct != null && r.batteryPct >= 98) chargeText = "Full";
  else if (r.mains === true && r.charging === false) chargeText = "Not charging";

  const health = healthOf(r);
  const replace = replaceOf(health, r.cycles);
  const replaceText = {
    good: "Battery is healthy",
    soon: "Replace the battery soon",
    now: "Replace the battery now",
    unknown: "Battery health not reported",
  }[replace];

  const warnings: string[] = [];
  if (!reporting) warnings.push("The module has not reported in over 15 minutes. Check it is switched on and has signal.");
  // Plugged into a live wall but not charging and not full is a fault: a bad
  // cable, a tripped charger, or a dead cell.
  if (r.mains === true && r.charging === false && r.batteryPct != null && r.batteryPct < 95) warnings.push("Wall power is on but the battery is not charging.");
  if (r.mains === false && r.batteryPct != null && r.batteryPct < 20) warnings.push("Battery below 20% with no wall power.");
  if (r.mainsVolts != null && r.mains !== false && (r.mainsVolts < 105 || r.mainsVolts > 130)) warnings.push(`Wall voltage is ${Math.round(r.mainsVolts)} V, outside the normal 105–130 V.`);
  if (r.tempC != null && r.tempC >= HOT_C) warnings.push(`Battery is hot (${Math.round(r.tempC)} °C). Move it somewhere cooler and out of direct heat.`);
  if (replace === "now") warnings.push("Battery capacity is below 70% of new. It may not last as long as the countdown assumes.");

  return {
    reporting,
    wall,
    wallText,
    chargeText,
    batteryPct: r.batteryPct,
    hoursLeft: hoursLeft(r),
    health,
    replace,
    replaceText,
    warnings,
    signal: signalOf(r.signalDbm),
  };
}
