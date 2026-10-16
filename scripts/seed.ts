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
    accessNotes: "Side door off the driveway; key in the lockbox, code 4412. Small friendly dog. Bedroom is on the first floor.",
  });
  // The shortest backup sets the clock: 4 h on the portable concentrator.
  await tx.insert(devices).values([
    { householdId: SEED_HOUSEHOLD_ID, type: "o2_concentrator", label: "Portable oxygen concentrator", backupHours: 4 },
    { householdId: SEED_HOUSEHOLD_ID, type: "cpap", label: "CPAP with battery pack", backupHours: 8 },
  ]);
  // Fixed responder-link keys so the demo links (/r/...a1, a2, a3) stay the same across reseeds.
  // Fictional 555-01xx numbers unless SEED_PHONE_* are set in .env.local.
  await tx.insert(contacts).values([
    // Where each lives, for the map: family 25 minutes away, the neighbor just down the road.
    { householdId: SEED_HOUSEHOLD_ID, name: "Family contact", phone: phone("SEED_PHONE_1", "+16035550101"), channel: "sms", priority: 1, place: "Wolfeboro", lat: 43.5843, lng: -71.2073, linkKey: "00000000-0000-4000-8000-0000000000a1" },
    { householdId: SEED_HOUSEHOLD_ID, name: "Neighbor (landline)", phone: phone("SEED_PHONE_2", "+16035550102"), channel: "voice", priority: 2, place: "Down the road", lat: 43.7462, lng: -71.1396, linkKey: "00000000-0000-4000-8000-0000000000a2" },
    { householdId: SEED_HOUSEHOLD_ID, name: "Town volunteer", phone: phone("SEED_PHONE_3", "+16035550103"), channel: "sms", priority: 3, isTownVolunteer: true, place: "West Ossipee", lat: 43.8178, lng: -71.2003, linkKey: "00000000-0000-4000-8000-0000000000a3" },
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
