// AI-assisted: written with Claude Code from the team's build spec.
// One incident on the EMS board: nearby sites on GET, a status update on POST.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { households } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { isEmsStatus, recordEms } from "@/lib/ems";
import { isUuid } from "@/lib/households";
import { bad, handle } from "@/lib/http";
import { nearbySites } from "@/lib/nearby";
import { and, eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };
const short = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  if (!isAdmin(req)) return bad("Not authorized.", 401);
  const id = (await params).id;
  if (!isUuid(id)) return bad("Unknown household.", 404);
  const [h] = await db.select({ lat: households.lat, lng: households.lng }).from(households).where(and(eq(households.id, id), eq(households.shareWithTown, true)));
  if (!h) return bad("Unknown household.", 404);
  return NextResponse.json({ sites: await nearbySites(h) });
});

export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  if (!isAdmin(req)) return bad("Not authorized.", 401);
  const id = (await params).id;
  if (!isUuid(id)) return bad("Unknown household.", 404);
  const body = await req.json();
  if (!isEmsStatus(body.status)) return bad("Choose a status.");
  const result = await recordEms({ householdId: id, status: body.status, unit: short(body.unit, 60), note: short(body.note, 300) });
  if ("error" in result) return bad(result.error, 409);
  return NextResponse.json(result);
});
