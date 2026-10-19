// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { getHousehold, isUuid, saveHousehold } from "@/lib/households";
import { accessFromRequest, userFromRequest } from "@/lib/auth";
import { isAdminStrict } from "@/lib/admin";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { households } from "@/db/schema";
import { audit } from "@/lib/security/audit";
import { bad, handle } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const data = await getHousehold((await params).id);
  if (!data) return bad("Household not found.", 404);
  if (!(await accessFromRequest(req, data.household))) return bad("Sign in as the person who set this household up.", 403);
  return NextResponse.json(data);
});

export const PUT = handle(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!isUuid(id)) return bad("Household not found.", 404);
  const existing = await getHousehold(id);
  if (!existing) return bad("Household not found.", 404);
  if (!(await accessFromRequest(req, existing.household))) return bad("Sign in as the person who set this household up.", 403);
  await saveHousehold(await req.json(), id);
  return NextResponse.json({ id });
});

// Delete the household and everything attached to it (devices, contacts, check-ins, alerts, events,
// power modules). Only its owner or the administrator. The audit log keeps a record that it happened,
// without the deleted information.
export const DELETE = handle(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!isUuid(id)) return bad("Household not found.", 404);
  const existing = await getHousehold(id);
  if (!existing) return bad("Household not found.", 404);
  const user = await userFromRequest(req);
  const admin = isAdminStrict(req);
  // An unowned (demo) household can't be deleted by whoever holds its link; only an owner or the admin.
  if (!admin && !(existing.household.ownerUserId && user?.id === existing.household.ownerUserId)) return bad("Only the person who set this household up can delete it.", 403);
  await db.delete(households).where(eq(households.id, id));
  await audit(req, { action: "household.deleted", actor: admin ? "admin" : `user:${user!.email}`, householdId: id });
  return NextResponse.json({ ok: true });
});
