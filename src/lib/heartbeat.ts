// AI-assisted: written with Claude Code from the team's build spec.
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { heartbeats, householdState, households } from "../db/schema";
import { getClock, simNow } from "./clock";
import { evaluateHousehold } from "./engine/tick";

export type HeartbeatResult = "recorded" | "ignored_replay" | "unknown_household";

// Appends a heartbeat and re-evaluates the household straight away, so an
// all-clear goes out within seconds of the phone coming back.
export async function recordHeartbeat(input: {
  householdId: string;
  batteryPct?: number | null;
  source: "pwa" | "replay";
  // Client timestamp for a heartbeat that waited in the offline queue.
  at?: Date;
}): Promise<HeartbeatResult> {
  const [household] = await db.select({ id: households.id }).from(households).where(eq(households.id, input.householdId));
  if (!household) return "unknown_household";

  const clock = await getClock();
  // While a storm replay runs against this household, real phone heartbeats
  // would cancel the simulated outage, so they are dropped.
  if (clock.replayActive && clock.householdId === input.householdId && input.source === "pwa") {
    return "ignored_replay";
  }

  const now = simNow(clock);
  // A queued heartbeat keeps its own time, but can never be in the future.
  const at = input.at && !clock.replayActive && input.at.getTime() < now.getTime() ? input.at : now;
  const battery =
    typeof input.batteryPct === "number" && input.batteryPct >= 0 && input.batteryPct <= 100
      ? Math.round(input.batteryPct)
      : null;

  await db.insert(heartbeats).values({ householdId: input.householdId, at, batteryPct: battery, source: input.source });
  await db
    .insert(householdState)
    .values({ householdId: input.householdId, lastHeartbeatAt: at })
    .onConflictDoUpdate({
      target: householdState.householdId,
      // Never move backwards: a late-flushed queued heartbeat must not hide a newer one.
      set: {
        lastHeartbeatAt: sql`GREATEST(COALESCE(${householdState.lastHeartbeatAt}, ${at.toISOString()}::timestamptz), ${at.toISOString()}::timestamptz)`,
      },
    });

  await evaluateHousehold(input.householdId);
  return "recorded";
}
