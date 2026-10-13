// AI-assisted: written with Claude Code from the team's build spec.
// One-command storm replay: `npm run replay`. Runs the seeded scenario
// against the seeded household, ticks the real state machine, and prints the
// event log as it happens. With --assert it also checks the whole chain and
// exits non-zero on any miss; CI runs it that way against simulated transport.
//
//   --speed N    clock multiplier (default REPLAY_CLOCK_MULTIPLIER or 120)
//   --assert     verify thresholds, idempotency, all-clear and reset
//   --keep       leave the replay state in place when done (default: reset)
import "./_env";
import { and, asc, eq, gt } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { alertsSent, contacts, events, householdState, nwsAlerts, replayScenarios } from "../src/db/schema";
import { defaultMultiplier } from "../src/lib/clock";
import { evaluateHousehold, tick } from "../src/lib/engine/tick";
import { recordHeartbeat } from "../src/lib/heartbeat";
import { resetReplay, runScenario } from "../src/lib/replay";
import { transportMode } from "../src/lib/twilio";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000001";
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const speedArg = args.indexOf("--speed");
const speed = speedArg >= 0 ? Number(args[speedArg + 1]) : defaultMultiplier();
const doAssert = flag("--assert");

process.env.PILOT_LIGHT_LOG = "0"; // this script prints events itself
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastEventId = 0;
async function printNewEvents() {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.householdId, HOUSEHOLD_ID), gt(events.id, lastEventId)))
    .orderBy(asc(events.id));
  for (const e of rows) {
    console.log(`  ${e.at.toISOString().slice(11, 19)}  ${e.kind.padEnd(16)} ${e.message}`);
    lastEventId = e.id;
  }
}

const failures: string[] = [];
function check(ok: boolean, what: string) {
  if (!ok) failures.push(what);
  if (doAssert) console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}`);
}

async function alertRows() {
  return db
    .select({ threshold: alertsSent.threshold, channel: alertsSent.channel, sid: alertsSent.twilioSid, name: contacts.name })
    .from(alertsSent)
    .innerJoin(contacts, eq(contacts.id, alertsSent.contactId))
    .where(eq(alertsSent.householdId, HOUSEHOLD_ID));
}

const [scenario] = await db.select().from(replayScenarios).limit(1);
if (!scenario) {
  console.error("No scenario found. Run `npm run db:seed` first.");
  process.exit(1);
}

console.log(`Replay "${scenario.name}" at ${speed}x, transport = ${transportMode()}`);
await runScenario({ scenarioId: scenario.id, householdId: HOUSEHOLD_ID, multiplier: speed });

// 3 h 35 min of simulated countdown plus slack, in real milliseconds.
const deadline = Date.now() + (4 * 3_600_000) / speed + 20_000;
const tickMs = Math.max(100, Math.min(1000, 60_000 / speed));
let done = false;
while (!done && Date.now() < deadline) {
  // Several evaluators at once, on purpose: the worker, the cron route and a
  // heartbeat can all race in production, and none of them may double-send.
  await Promise.all([tick(), evaluateHousehold(HOUSEHOLD_ID), evaluateHousehold(HOUSEHOLD_ID)]);
  await printNewEvents();
  const rows = await alertRows();
  const h0 = rows.filter((r) => r.threshold === "h0");
  done = h0.length > 0 && h0.every((r) => r.sid);
  if (!done) await sleep(tickMs);
}

if (!done) {
  check(false, "0 h threshold delivered before the deadline");
} else if (doAssert) {
  const rows = await alertRows();
  const key = (t: string) => rows.filter((r) => r.threshold === t).map((r) => `${r.name}/${r.channel}`).sort().join(", ");
  check(key("h6") === "Family contact/sms", `6 h goes to priority 1 only (got: ${key("h6")})`);
  check(key("h2") === "Family contact/sms, Neighbor (landline)/voice", `2 h goes to priorities 1 and 2 (got: ${key("h2")})`);
  check(key("h0") === "Family contact/sms, Neighbor (landline)/voice, Town volunteer/sms", `0 h goes to everyone plus the town volunteer (got: ${key("h0")})`);
  check(rows.every((r) => r.sid), "every alert row has a delivery id");

  const before = rows.length;
  await Promise.all([tick(), tick(), tick(), evaluateHousehold(HOUSEHOLD_ID)]);
  check((await alertRows()).length === before, `racing ticks send nothing twice (${before} rows before and after)`);
  const sentEvents = await db.select().from(events).where(and(eq(events.householdId, HOUSEHOLD_ID), eq(events.kind, "sent")));
  check(sentEvents.length === before, `one send per alert row (${sentEvents.length} sends, ${before} rows)`);

  await recordHeartbeat({ householdId: HOUSEHOLD_ID, source: "replay", batteryPct: 40 });
  await recordHeartbeat({ householdId: HOUSEHOLD_ID, source: "replay", batteryPct: 40 });
  await printNewEvents();
  const clear = (await alertRows()).filter((r) => r.threshold === "all_clear");
  check(clear.length === 3 && clear.every((r) => r.sid), `one all-clear to each of the 3 people reached, even with two heartbeats (got ${clear.length})`);
  await tick();
  const [state] = await db.select().from(householdState).where(eq(householdState.householdId, HOUSEHOLD_ID));
  check(state.status === "warning_active", `back to warning_active after the all-clear (got ${state.status})`);
}

if (!flag("--keep")) {
  await resetReplay();
  if (doAssert) {
    const [state] = await db.select().from(householdState).where(eq(householdState.householdId, HOUSEHOLD_ID));
    const left = (await alertRows()).length + (await db.select().from(nwsAlerts).where(eq(nwsAlerts.replay, true))).length;
    check(state.status === "normal" && left === 0, "reset returns to a clean state");
  }
  console.log("Reset done.");
}

await closeDb();
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(doAssert ? "\nAll checks passed." : "\nReplay finished.");
