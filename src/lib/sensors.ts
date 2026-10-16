// AI-assisted: written with Claude Code from the team's build spec.
// Power modules: pairing one to a household, and storing what it reports.
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { sensorReadings, sensors, type SensorReading } from "../db/schema";
import { getClock, simNow } from "./clock";
import { logEvent } from "./events";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

// Creates a module for a household and returns its token once. Only the hash is kept.
export async function createSensor(householdId: string, label: string) {
  const token = "pl_" + randomBytes(18).toString("base64url");
  const [row] = await db.insert(sensors).values({ householdId, label: label.trim().slice(0, 60) || "Power module", tokenHash: hash(token) }).returning();
  return { sensor: row, token };
}

export async function sensorForToken(token: string) {
  const [row] = await db.select().from(sensors).where(eq(sensors.tokenHash, hash(token)));
  return row ?? null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean | null => {
  if (v === true || v === 1 || v === "1" || v === "true" || v === "on") return true;
  if (v === false || v === 0 || v === "0" || v === "false" || v === "off") return false;
  return null;
};
const clamp = (n: number | null, lo: number, hi: number) => (n == null ? null : Math.max(lo, Math.min(hi, n)));

// Accepts long names or the short ones a constrained modem can fit in a URL.
export function parseReading(input: Record<string, unknown>) {
  const pick = (...keys: string[]) => keys.map((k) => input[k]).find((v) => v !== undefined);
  return {
    mains: bool(pick("mains", "m")),
    mainsVolts: clamp(num(pick("mains_volts", "v")), 0, 300),
    charging: bool(pick("charging", "c")),
    batteryPct: clamp(num(pick("battery_pct", "b", "soc")), 0, 100),
    batteryVolts: clamp(num(pick("battery_volts", "bv")), 0, 100),
    capacityWh: clamp(num(pick("capacity_wh", "wh")), 0, 10_000),
    healthPct: clamp(num(pick("health_pct", "h", "soh")), 0, 100),
    cycles: (() => {
      const n = num(pick("cycles", "cy"));
      return n == null ? null : Math.max(0, Math.round(n));
    })(),
    outputWatts: clamp(num(pick("output_watts", "w")), 0, 5_000),
    tempC: clamp(num(pick("temp_c", "tc")), -60, 120),
    signalDbm: (() => {
      const n = num(pick("signal_dbm", "rssi"));
      return n == null ? null : Math.round(Math.max(-150, Math.min(0, n)));
    })(),
  };
}

// Stores one report and logs wall power and charging changes to the household's activity.
export async function recordReading(sensorId: string, fields: ReturnType<typeof parseReading>, opts: { simulated?: boolean } = {}) {
  const [sensor] = await db.select().from(sensors).where(eq(sensors.id, sensorId));
  if (!sensor) throw new Error("Unknown sensor");
  const at = simNow(await getClock());
  const [prev] = await db.select().from(sensorReadings).where(eq(sensorReadings.sensorId, sensorId)).orderBy(desc(sensorReadings.at)).limit(1);
  await db.insert(sensorReadings).values({ sensorId, at, ...fields, simulated: opts.simulated ?? false });
  await db.update(sensors).set({ lastSeenAt: at }).where(eq(sensors.id, sensorId));

  const tag = opts.simulated ? " (simulated)" : "";
  if (fields.mains != null && prev?.mains !== fields.mains) {
    await logEvent(db, {
      householdId: sensor.householdId,
      at,
      kind: fields.mains ? "power_on" : "power_off",
      message: fields.mains ? `${sensor.label}: wall power is on${tag}.` : `${sensor.label}: wall power is off, running on battery${fields.batteryPct != null ? ` at ${Math.round(fields.batteryPct)}%` : ""}${tag}.`,
    });
  }
  return { at };
}

export async function latestReadings(householdId: string) {
  const list = await db.select().from(sensors).where(eq(sensors.householdId, householdId)).orderBy(sensors.createdAt);
  const out: { id: string; label: string; createdAt: Date; lastSeenAt: Date | null; reading: SensorReading | null; history: { at: Date; batteryPct: number | null; mains: boolean | null }[] }[] = [];
  for (const s of list) {
    const recent = await db
      .select()
      .from(sensorReadings)
      .where(eq(sensorReadings.sensorId, s.id))
      .orderBy(desc(sensorReadings.at))
      .limit(48);
    out.push({
      id: s.id,
      label: s.label,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      reading: recent[0] ?? null,
      history: recent.map((r) => ({ at: r.at, batteryPct: r.batteryPct, mains: r.mains })).reverse(),
    });
  }
  return out;
}

export async function deleteSensor(householdId: string, sensorId: string) {
  const gone = await db.delete(sensors).where(and(eq(sensors.id, sensorId), eq(sensors.householdId, householdId))).returning({ id: sensors.id });
  return gone.length > 0;
}
