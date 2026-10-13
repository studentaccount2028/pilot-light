// AI-assisted: written with Claude Code from the team's build spec.
// POST { household_id, battery_pct?, at? } from the household's phone.
import { NextResponse, type NextRequest } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { isUuid } from "@/lib/households";
import { bad, handle } from "@/lib/http";

export const POST = handle(async (req: NextRequest) => {
  const body = await req.json();
  const householdId = body.household_id ?? body.householdId;
  if (!isUuid(householdId)) return bad("household_id is required.");
  const at = typeof body.at === "string" && !Number.isNaN(Date.parse(body.at)) ? new Date(body.at) : undefined;
  const result = await recordHeartbeat({ householdId, batteryPct: body.battery_pct ?? body.batteryPct, source: "pwa", at });
  if (result === "unknown_household") return bad("Household not found.", 404);
  return NextResponse.json({ ok: true, result });
});
