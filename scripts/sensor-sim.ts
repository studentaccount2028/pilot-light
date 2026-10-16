// AI-assisted: written with Claude Code from the team's build spec.
// Stands in for the power module until the hardware exists. Writes a run of
// readings, marked simulated, so the status card has something real-shaped
// to show. It goes through the same parser and storage as the report endpoint.
//
//   npm run sensor:sim -- normal   charging on wall power, healthy battery
//   npm run sensor:sim -- outage   wall power drops, battery drains
//   npm run sensor:sim -- worn     an old battery that should be replaced
//   npm run sensor:sim -- fault    wall on but battery not charging
//   npm run sensor:sim -- clear    delete the demo module
import "./_env";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { sensorReadings, sensors } from "../src/db/schema";
import { getClock, simNow } from "../src/lib/clock";
import { createSensor, parseReading, recordReading } from "../src/lib/sensors";

const HOUSEHOLD = process.argv[3] ?? "00000000-0000-4000-8000-000000000001";
const mode = process.argv[2] ?? "normal";
const LABEL = "Demo power module";

const [existing] = await db.select().from(sensors).where(and(eq(sensors.householdId, HOUSEHOLD), eq(sensors.label, LABEL)));
if (mode === "clear") {
  if (existing) await db.delete(sensors).where(eq(sensors.id, existing.id));
  console.log(existing ? "Demo module removed." : "No demo module.");
  await closeDb();
  process.exit(0);
}
const sensorId = existing?.id ?? (await createSensor(HOUSEHOLD, LABEL)).sensor.id;
// Start each run from a clean history so the chart shows just this scenario.
await db.delete(sensorReadings).where(eq(sensorReadings.sensorId, sensorId));

// 24 readings, 5 minutes apart, ending now.
const base = { v: 121, wh: 256, w: 46, rssi: -93, tc: 24 };
const steps = 24;
const now = simNow(await getClock()).getTime();
const rows: Record<string, unknown>[] = [];
for (let i = 0; i < steps; i++) {
  if (mode === "outage") {
    // 16 readings on the wall, then the power goes and the pack drains.
    const onWall = i < 16;
    const b = onWall ? Math.min(100, 88 + i) : Math.max(0, 100 - (i - 15) * 1.6);
    rows.push({ ...base, m: onWall ? 1 : 0, v: onWall ? 120 : 0, c: onWall && b < 100 ? 1 : 0, b, h: 94, cy: 112 });
  } else if (mode === "worn") {
    rows.push({ ...base, m: 1, c: i < 20 ? 1 : 0, b: Math.min(100, 70 + i * 1.5), h: 74, cy: 640, tc: 31 });
  } else if (mode === "fault") {
    rows.push({ ...base, m: 1, c: 0, b: Math.max(0, 61 - i * 0.4), h: 92, cy: 140 });
  } else {
    rows.push({ ...base, m: 1, c: i < 18 ? 1 : 0, b: Math.min(100, 76 + i * 1.4), h: 96, cy: 58 });
  }
}

for (let i = 0; i < rows.length; i++) {
  await recordReading(sensorId, parseReading(rows[i]), { simulated: true });
  // recordReading stamps "now"; spread the history back over the last two hours.
  const at = new Date(now - (rows.length - 1 - i) * 5 * 60_000);
  const [last] = await db.select({ id: sensorReadings.id }).from(sensorReadings).where(eq(sensorReadings.sensorId, sensorId)).orderBy(sensorReadings.id).limit(1).offset(i);
  await db.update(sensorReadings).set({ at }).where(eq(sensorReadings.id, last.id));
}
await db.update(sensors).set({ lastSeenAt: new Date(now) }).where(eq(sensors.id, sensorId));
console.log(`Wrote ${rows.length} simulated "${mode}" readings for ${LABEL}.`);
await closeDb();
