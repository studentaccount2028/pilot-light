// AI-assisted: written with Claude Code from the team's build spec.
// Storm replay controls. Admin only. Every action here changes inputs
// (alert, heartbeats, clock speed, a reply); none of them touches the rules.
import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { contacts, households } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/security/audit";
import { getClock } from "@/lib/clock";
import { evaluateHousehold, tick } from "@/lib/engine/tick";
import { recordHeartbeat } from "@/lib/heartbeat";
import { getStatus, isUuid } from "@/lib/households";
import { bad, handle } from "@/lib/http";
import { handleReply, type ReplyWord } from "@/lib/inbound";
import { listScenarios, REPLAY_SPEEDS, resetReplay, runScenario } from "@/lib/replay";
import { publicBaseUrl, transportMode } from "@/lib/twilio";

export const dynamic = "force-dynamic";
const SEED_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000001";

async function snapshot(householdId: string | null) {
  const clock = await getClock();
  const id = clock.replayActive && clock.householdId ? clock.householdId : householdId;
  return {
    scenarios: await listScenarios(),
    // The seeded demo household first, then the rest in the order they were made.
    households: await db.select({ id: households.id, label: households.label, town: households.town }).from(households).orderBy(sql`${households.id} = ${SEED_HOUSEHOLD_ID} DESC`, households.createdAt),
    speeds: REPLAY_SPEEDS,
    replayActive: clock.replayActive,
    multiplier: clock.multiplier,
    scenarioId: clock.scenarioId,
    transport: transportMode(),
    inboundReady: Boolean(publicBaseUrl()),
    status: id && isUuid(id) ? await getStatus(id) : null,
  };
}

export const GET = handle(async (req: NextRequest) => {
  if (!isAdmin(req)) return bad("Not authorized.", 401);
  // Hosts without a worker or minute cron (Vercel Hobby): the console's poll drives the replay.
  const clock = await getClock();
  if (clock.replayActive && clock.householdId) await evaluateHousehold(clock.householdId);
  return NextResponse.json(await snapshot(req.nextUrl.searchParams.get("household")), { headers: { "Cache-Control": "no-store" } });
});

export const POST = handle(async (req: NextRequest) => {
  if (!isAdmin(req)) return bad("Not authorized.", 401);
  const body = await req.json();
  const clock = await getClock();

  if (body.action === "run") {
    if (!isUuid(body.householdId)) return bad("Choose a household.");
    if (typeof body.scenarioId !== "string") return bad("Choose a scenario.");
    const multiplier = Number(body.multiplier);
    if (!REPLAY_SPEEDS.includes(multiplier)) return bad("Choose a speed.");
    await runScenario({ scenarioId: body.scenarioId, householdId: body.householdId, multiplier, promptReplied: body.promptReplied !== false });
    await tick(); // first evaluation right away rather than on the worker's next beat
  } else if (body.action === "reset") {
    await resetReplay();
  } else if (body.action === "heartbeat") {
    // "Power is back": the household phone reconnects.
    if (!clock.replayActive || !clock.householdId) return bad("No replay is running.");
    await recordHeartbeat({ householdId: clock.householdId, source: "replay", batteryPct: 35 });
  } else if (body.action === "reply") {
    // Stand-in for a real text reply when no phone is in the loop.
    if (!clock.replayActive) return bad("No replay is running.");
    const word = body.word as ReplyWord;
    if (!["OK", "HELP", "CHECKED"].includes(word) || !isUuid(body.contactId)) return bad("Unknown reply.");
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, body.contactId));
    if (!contact) return bad("Unknown contact.");
    const etaMinutes = Number.isFinite(body.etaMinutes) ? Number(body.etaMinutes) : null;
    await handleReply({ fromPhone: contact.phone, word, via: "simulated", etaMinutes });
  } else {
    return bad("Unknown action.");
  }
  await audit(req, { action: "replay.control", actor: "admin", householdId: isUuid(body.householdId) ? body.householdId : null, detail: String(body.action) });
  return NextResponse.json(await snapshot(body.householdId ?? null));
});
