// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { getStatus } from "@/lib/households";
import { accessFromRequest } from "@/lib/auth";
import { getClock } from "@/lib/clock";
import { evaluateHousehold } from "@/lib/engine/tick";
import { bad, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = (await params).id;
  // Hosts without a background worker (Vercel): while a storm replay runs on
  // this household, the status screen's own poll moves it forward, so the
  // household page alone is enough to watch a replay.
  const clock = await getClock();
  if (clock.replayActive && clock.householdId === id) await evaluateHousehold(id);
  const data = await getStatus(id);
  if (!data) return bad("Household not found.", 404);
  if (!(await accessFromRequest(req, data.household))) return bad("Sign in as the person who set this household up.", 403);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
});
