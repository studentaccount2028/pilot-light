// AI-assisted: written with Claude Code from the team's build spec.
// Seeds one simulated Ossipee household and the storm replay scenario.
// Safe to run again: it replaces the seeded rows.
import "./_env";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { appClock, contacts, devices, householdState, households, replayScenarios } from "../src/db/schema";
import { normalizePhone } from "../src/lib/twilio";

export const SEED_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000001";

function phone(envName: string, fallback: string): string {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const e164 = normalizePhone(raw);
  if (!e164) throw new Error(`${envName} is not a valid phone number: ${raw}`);
  return e164;
}

const scenario = JSON.parse(readFileSync("seed/replay_ossipee.json", "utf-8"));

await db.transaction(async (tx) => {
  await tx.insert(appClock).values({ id: 1 }).onConflictDoNothing();

  await tx.delete(households).where(eq(households.id, SEED_HOUSEHOLD_ID));
  await tx.insert(households).values({
    id: SEED_HOUSEHOLD_ID,
    label: "Mom's house",
    address: "Main Street, Center Ossipee, NH 03814 (simulated household)",
    town: "Ossipee",
    lat: 43.7528,
    lng: -71.1509,
    nwsZone: "NHZ006",
    zoneName: "Southern Carroll",
    utility: "nhec",
    shareWithTown: true,
    // Lives alone and is 82, but can get around and reach the backup.
    residentName: "Mom",
    residentPhone: phone("SEED_PHONE_RESIDENT", "+16035550100"),
    residentChannel: "voice",
    residentBirthYear: new Date().getUTCFullYear() - 82,
    livesAlone: true,
    canLeaveUnassisted: true,
    canReachBackup: true,
  });
  // The shortest backup sets the clock: 4 h on the portable concentrator.
  await tx.insert(devices).values([
    { householdId: SEED_HOUSEHOLD_ID, type: "o2_concentrator", label: "Portable oxygen concentrator", backupHours: 4 },
    { householdId: SEED_HOUSEHOLD_ID, type: "cpap", label: "CPAP with battery pack", backupHours: 8 },
  ]);
  // Fictional 555-01xx numbers unless SEED_PHONE_* are set in .env.local.
  await tx.insert(contacts).values([
    { householdId: SEED_HOUSEHOLD_ID, name: "Family contact", phone: phone("SEED_PHONE_1", "+16035550101"), channel: "sms", priority: 1 },
    { householdId: SEED_HOUSEHOLD_ID, name: "Neighbor (landline)", phone: phone("SEED_PHONE_2", "+16035550102"), channel: "voice", priority: 2 },
    { householdId: SEED_HOUSEHOLD_ID, name: "Town volunteer", phone: phone("SEED_PHONE_3", "+16035550103"), channel: "sms", priority: 3, isTownVolunteer: true },
  ]);
  await tx.insert(householdState).values({ householdId: SEED_HOUSEHOLD_ID });

  await tx
    .insert(replayScenarios)
    .values({ id: scenario.id, name: scenario.name, alertJson: scenario.alert, heartbeatScript: scenario.heartbeatScript })
    .onConflictDoUpdate({
      target: replayScenarios.id,
      set: { name: scenario.name, alertJson: scenario.alert, heartbeatScript: scenario.heartbeatScript },
    });
});

console.log(`Seeded household ${SEED_HOUSEHOLD_ID} (Ossipee, NHZ006) and scenario "${scenario.name}".`);
console.log(`Status page: /h/${SEED_HOUSEHOLD_ID}`);
await closeDb();
