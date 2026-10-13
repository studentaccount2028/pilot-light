// AI-assisted: written with Claude Code from the team's build spec.
// The app clock. Real time normally; during a storm replay it runs N times
// faster from the moment Run was clicked. Every rule in the engine takes
// "now" from here, which is how replay fakes the storm without touching logic.
import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "../db/client";
import { appClock, type AppClock } from "../db/schema";

export function simNow(clock: Pick<AppClock, "anchorReal" | "anchorSim" | "multiplier">, realMs = Date.now()): Date {
  const elapsed = realMs - clock.anchorReal.getTime();
  return new Date(clock.anchorSim.getTime() + elapsed * clock.multiplier);
}

export async function getClock(d: DbOrTx = db): Promise<AppClock> {
  const [row] = await d.select().from(appClock).where(eq(appClock.id, 1));
  if (row) return row;
  const [created] = await d
    .insert(appClock)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await d.select().from(appClock).where(eq(appClock.id, 1));
  return again;
}

export async function now(d: DbOrTx = db): Promise<Date> {
  return simNow(await getClock(d));
}

export function defaultMultiplier(): number {
  const n = Number(process.env.REPLAY_CLOCK_MULTIPLIER);
  return Number.isFinite(n) && n >= 1 ? n : 120;
}
