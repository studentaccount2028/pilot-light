// AI-assisted: written with Claude Code from the team's build spec.
import { db, type DbOrTx } from "../db/client";
import { events } from "../db/schema";

export async function logEvent(
  d: DbOrTx,
  e: { householdId: string | null; at: Date; kind: string; message: string; data?: unknown },
) {
  await d.insert(events).values({
    householdId: e.householdId,
    at: e.at,
    kind: e.kind,
    message: e.message,
    data: e.data ?? null,
  });
  if (process.env.PILOT_LIGHT_LOG !== "0") {
    console.log(`[${e.at.toISOString()}] ${e.kind}: ${e.message}`);
  }
}

export { db };
