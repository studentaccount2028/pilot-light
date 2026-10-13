// AI-assisted: written with Claude Code from the team's build spec.
// Town volunteer roster: opted-in households in one town, most urgent first.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { isAdmin } from "@/lib/admin";
import { getClock, simNow } from "@/lib/clock";
import { TIER_RANK } from "@/lib/engine/risk";
import { limitingDevice } from "@/lib/engine/rules";
import { logEvent } from "@/lib/events";
import { isUuid, listForTown } from "@/lib/households";
import { bad, handle } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  if (!isAdmin(req)) return bad("Not authorized.", 401);
  const town = decodeURIComponent((await params).name);
  const clock = await getClock();
  const now = simNow(clock);
  const rows = (await listForTown(town)).map((r) => {
    const inIncident = r.state?.status === "probable_outage" || r.state?.status === "countdown";
    const remainingMs = inIncident && r.state?.countdownZeroAt ? r.state.countdownZeroAt.getTime() - now.getTime() : null;
    const limiting = limitingDevice(r.devices);
    return {
      id: r.household.id,
      label: r.household.label,
      address: r.household.address,
      lat: r.household.lat,
      lng: r.household.lng,
      status: r.state?.status ?? "normal",
      resolvedReason: r.state?.resolvedReason ?? null,
      lastHeartbeatAt: r.state?.lastHeartbeatAt ?? null,
      remainingMs,
      limitingDevice: limiting.device?.label ?? null,
      limitingHours: limiting.hours,
      lastCheck: r.lastCheck,
      tier: r.risk.tier,
      reason: r.risk.reason,
      noReply: r.risk.prompt === "no_reply",
    };
  });
  // HELP first, then least time remaining, then everyone else.
  const rank = (r: (typeof rows)[number]) => (r.resolvedReason === "help" && r.status === "resolved" ? -1 : r.remainingMs ?? Number.MAX_SAFE_INTEGER);
  // Within an outage: Check first on top, Check in the middle, Stable at the bottom.
  const active = (r: (typeof rows)[number]) => (rank(r) === Number.MAX_SAFE_INTEGER ? 1 : 0);
  rows.sort((a, b) => active(a) - active(b) || TIER_RANK[a.tier] - TIER_RANK[b.tier] || rank(a) - rank(b) || a.label.localeCompare(b.label));
  return NextResponse.json({ town, now: now.toISOString(), multiplier: clock.multiplier, rows }, { headers: { "Cache-Control": "no-store" } });
});

// Coordinator marks a household as checked from the roster.
export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  if (!isAdmin(req)) return bad("Not authorized.", 401);
  const town = decodeURIComponent((await params).name);
  const body = await req.json();
  if (!isUuid(body.householdId)) return bad("Unknown household.");
  const rows = await listForTown(town);
  if (!rows.some((r) => r.household.id === body.householdId)) return bad("That household is not on this town's roster.", 404);
  await logEvent(db, {
    householdId: body.householdId,
    at: simNow(await getClock()),
    kind: "checked",
    message: "Town coordinator marked this household as checked on the roster. The clock keeps running.",
  });
  return NextResponse.json({ ok: true });
});
