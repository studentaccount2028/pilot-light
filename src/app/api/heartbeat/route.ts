// AI-assisted: written with Claude Code from the team's build spec and security plan.
// POST { household_id, battery_pct?, at? } from the household's phone, with
// "Authorization: Bearer <house-phone token>" (issued when the phone was paired).
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { households } from "@/db/schema";
import { recordHeartbeat } from "@/lib/heartbeat";
import { checkHeartbeat } from "@/lib/housePhone";
import { isUuid } from "@/lib/households";
import { bad, handle } from "@/lib/http";
import { limited } from "@/lib/security/rateLimit";

export const POST = handle(async (req: NextRequest) => {
  const slow = limited(req, "heartbeat");
  if (slow) return slow;
  const body = await req.json();
  const householdId = body.household_id ?? body.householdId;
  if (!isUuid(householdId)) return bad("household_id is required.");
  const [h] = await db.select({ heartbeatTokenHash: households.heartbeatTokenHash, ownerUserId: households.ownerUserId }).from(households).where(eq(households.id, householdId));
  if (!h) return bad("Household not found.", 404);
  const auth = req.headers.get("authorization");
  const check = checkHeartbeat(h, auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null);
  if (check === "pair_required") return bad("Pair this phone again: turn \"This phone stays at the house\" off and on.", 401);
  if (check === "bad_token") return bad("This phone is no longer paired with the house.", 401);
  const at = typeof body.at === "string" && !Number.isNaN(Date.parse(body.at)) ? new Date(body.at) : undefined;
  const result = await recordHeartbeat({ householdId, batteryPct: body.battery_pct ?? body.batteryPct, source: "pwa", at });
  if (result === "unknown_household") return bad("Household not found.", 404);
  return NextResponse.json({ ok: true, result });
});
