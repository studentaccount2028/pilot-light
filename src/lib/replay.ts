// AI-assisted: written with Claude Code from the team's build spec.
// Storm replay: the demo switch and the test harness in one. It only touches
// inputs (an archived NWS alert, the heartbeat history, the clock speed). The
// state machine then runs exactly as it would in a real storm.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { alertsSent, appClock, events, heartbeats, householdState, households, nwsAlerts, replayScenarios } from "../db/schema";
import { getClock } from "./clock";
import { logEvent } from "./events";
import { alertRow } from "./nws";

const MIN = 60_000;
export const REPLAY_SPEEDS = [1, 30, 120];

interface HeartbeatStep {
  minutesBeforeRun: number;
  batteryPct?: number;
}

// promptReplied: whether the resident answered the storm prompt before the
// power went out. It is an input like the alert and the heartbeats.
export async function runScenario(input: { scenarioId: string; householdId: string; multiplier: number; promptReplied?: boolean }) {
  if (!Number.isFinite(input.multiplier) || input.multiplier < 1) throw new Error("Speed must be 1 or more.");
  const [scenario] = await db.select().from(replayScenarios).where(eq(replayScenarios.id, input.scenarioId));
  if (!scenario) throw new Error("Unknown scenario. Run `npm run db:seed`.");
  const [household] = await db.select().from(households).where(eq(households.id, input.householdId));
  if (!household) throw new Error("Unknown household.");

  await resetReplay();
  const promptReplied = input.promptReplied !== false;

  const row = alertRow(scenario.alertJson as Parameters<typeof alertRow>[0]);
  if (!row) throw new Error("Scenario alert is missing id, event, onset or expiry.");
  const script = (scenario.heartbeatScript as HeartbeatStep[]).slice().sort((a, b) => b.minutesBeforeRun - a.minutesBeforeRun);
  if (script.length === 0) throw new Error("Scenario has no heartbeat script.");

  await db.transaction(async (tx) => {
    const start = new Date();
    await tx.insert(householdState).values({ householdId: household.id }).onConflictDoNothing();
    const [state] = await tx.select().from(householdState).where(eq(householdState.householdId, household.id)).for("update");

    await tx
      .insert(appClock)
      .values({ id: 1 })
      .onConflictDoNothing();
    await tx
      .update(appClock)
      .set({
        replayActive: true,
        multiplier: input.multiplier,
        anchorReal: start,
        anchorSim: start,
        scenarioId: scenario.id,
        householdId: household.id,
        prevLastHeartbeatAt: state.lastHeartbeatAt,
      })
      .where(eq(appClock.id, 1));

    // The archived warning, moved in time so it is in force right now. The
    // household's own zone is added in case it sits outside the original area.
    const zones = row.zones.includes(household.nwsZone) ? row.zones : [...row.zones, household.nwsZone];
    await tx
      .insert(nwsAlerts)
      .values({
        ...row,
        zones,
        onset: new Date(start.getTime() - 60 * MIN),
        expires: new Date(start.getTime() + 12 * 60 * MIN),
        replay: true,
      })
      .onConflictDoUpdate({
        target: nwsAlerts.id,
        set: { zones, onset: new Date(start.getTime() - 60 * MIN), expires: new Date(start.getTime() + 12 * 60 * MIN), replay: true },
      });

    // Heartbeat history that ends in silence.
    await tx.insert(heartbeats).values(
      script.map((s) => ({
        householdId: household.id,
        at: new Date(start.getTime() - s.minutesBeforeRun * MIN),
        batteryPct: s.batteryPct ?? null,
        source: "replay" as const,
      })),
    );
    const last = script[script.length - 1];
    await tx
      .update(householdState)
      .set({
        status: "normal",
        outageInferredAt: null,
        countdownZeroAt: null,
        activeAlertId: null,
        resolvedReason: null,
        lastHeartbeatAt: new Date(start.getTime() - last.minutesBeforeRun * MIN),
        promptAlertId: household.residentPhone ? row.id : null,
        promptSentAt: household.residentPhone ? new Date(start.getTime() - 55 * MIN) : null,
        promptConfirmedAt: household.residentPhone && promptReplied ? new Date(start.getTime() - 50 * MIN) : null,
        promptAttempts: 0,
        updatedAt: start,
      })
      .where(eq(householdState.householdId, household.id));

    if (household.residentPhone) {
      const who = household.residentName?.trim() || "the resident";
      await logEvent(tx, { householdId: household.id, at: new Date(start.getTime() - 55 * MIN), kind: "prompt", message: `Storm prompt sent to ${who}: is the backup charged, plugged in and within reach?` });
      if (promptReplied) {
        await logEvent(tx, { householdId: household.id, at: new Date(start.getTime() - 50 * MIN), kind: "prompt_reply", message: `${who} replied ready: backup charged, plugged in and within reach.` });
      }
    }

    await logEvent(tx, {
      householdId: household.id,
      at: start,
      kind: "replay",
      message: `Replay started at ${input.multiplier}x: "${scenario.name}". Injected archived alert; last heartbeat set to ${last.minutesBeforeRun} minutes ago.`,
      data: { scenarioId: scenario.id, multiplier: input.multiplier },
    });
  });
}

// One transaction back to a clean slate: injected alert gone, heartbeat
// restored, this household's alerts and log cleared, clock back to real time.
export async function resetReplay(): Promise<void> {
  await db.transaction(async (tx) => {
    const clock = await getClock(tx);
    const real = new Date();
    if (clock.replayActive && clock.householdId) {
      const id = clock.householdId;
      await tx.delete(heartbeats).where(and(eq(heartbeats.householdId, id), eq(heartbeats.source, "replay")));
      await tx.delete(alertsSent).where(eq(alertsSent.householdId, id));
      await tx.delete(events).where(eq(events.householdId, id));
      await tx
        .update(householdState)
        .set({
          status: "normal",
          outageInferredAt: null,
          countdownZeroAt: null,
          activeAlertId: null,
          resolvedReason: null,
          lastHeartbeatAt: clock.prevLastHeartbeatAt,
          promptAlertId: null,
          promptSentAt: null,
          promptConfirmedAt: null,
          promptAttempts: 0,
          updatedAt: real,
        })
        .where(eq(householdState.householdId, id));
    }
    await tx.delete(nwsAlerts).where(eq(nwsAlerts.replay, true));
    // The replay clock ran ahead of real time; nothing may be left in the future.
    await tx.update(householdState).set({ lastHeartbeatAt: real }).where(gt(householdState.lastHeartbeatAt, real));
    await tx.update(heartbeats).set({ at: real }).where(gt(heartbeats.at, real));
    await tx
      .update(appClock)
      .set({ replayActive: false, multiplier: 1, anchorReal: real, anchorSim: real, scenarioId: null, householdId: null, prevLastHeartbeatAt: null })
      .where(eq(appClock.id, 1));
  });
}

export async function listScenarios() {
  return db.select({ id: replayScenarios.id, name: replayScenarios.name }).from(replayScenarios).orderBy(replayScenarios.name);
}

export async function countReplayAlerts(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(nwsAlerts).where(eq(nwsAlerts.replay, true));
  return r.n;
}
