// AI-assisted: written with Claude Code from the team's build spec.
// Quick edit of one device's backup hours from the status screen. This is the
// write the offline queue stores and forwards.
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { devices, households } from "@/db/schema";
import { now } from "@/lib/clock";
import { evaluateHousehold } from "@/lib/engine/tick";
import { logEvent } from "@/lib/events";
import { isUuid, parseBackupHours } from "@/lib/households";
import { accessFromRequest } from "@/lib/auth";
import { bad, handle } from "@/lib/http";

export const PATCH = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!isUuid(id)) return bad("Device not found.", 404);
  const [owner] = await db
    .select({ ownerUserId: households.ownerUserId })
    .from(devices)
    .innerJoin(households, eq(households.id, devices.householdId))
    .where(eq(devices.id, id));
  if (!owner) return bad("Device not found.", 404);
  if (!(await accessFromRequest(req, owner))) return bad("Sign in as the person who set this household up.", 403);
  const body = await req.json();
  const backupHours = parseBackupHours(body.backupHours);
  const [device] = await db.update(devices).set({ backupHours }).where(eq(devices.id, id)).returning();
  if (!device) return bad("Device not found.", 404);
  await logEvent(db, {
    householdId: device.householdId,
    at: await now(),
    kind: "battery_edit",
    message: `${device.label} backup set to ${backupHours == null ? "none" : backupHours + " h"}.`,
  });
  await evaluateHousehold(device.householdId);
  return NextResponse.json({ ok: true });
});
