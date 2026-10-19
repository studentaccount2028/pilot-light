// AI-assisted: written with Claude Code from the team's security plan.
// Pair (POST) or unpair (DELETE) the phone that stays at the house. Only someone with access to the
// household can do it. Pairing again replaces the old token, so a lost phone is cut off.
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { households } from "@/db/schema";
import { canAccess, userFromRequest } from "@/lib/auth";
import { isAdminStrict } from "@/lib/admin";
import { hashHousePhoneToken, newHousePhoneToken } from "@/lib/housePhone";
import { isUuid } from "@/lib/households";
import { bad, handle } from "@/lib/http";
import { audit } from "@/lib/security/audit";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function load(req: NextRequest, id: string) {
  if (!isUuid(id)) return null;
  const [h] = await db.select({ id: households.id, ownerUserId: households.ownerUserId }).from(households).where(eq(households.id, id));
  if (!h) return null;
  const user = await userFromRequest(req);
  const admin = isAdminStrict(req);
  return canAccess(h, user, admin) ? { ...h, actor: admin ? "admin" : user ? `user:${user.email}` : "household-link" } : null;
}

export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const id = (await params).id;
  const h = await load(req, id);
  if (!h) return bad("Not authorized.", 401);
  const token = newHousePhoneToken();
  await db.update(households).set({ heartbeatTokenHash: hashHousePhoneToken(token) }).where(eq(households.id, id));
  await audit(req, { action: "household.house_phone_paired", actor: h.actor, householdId: id });
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
});

export const DELETE = handle(async (req: NextRequest, { params }: Ctx) => {
  const id = (await params).id;
  const h = await load(req, id);
  if (!h) return bad("Not authorized.", 401);
  await db.update(households).set({ heartbeatTokenHash: null }).where(eq(households.id, id));
  await audit(req, { action: "household.house_phone_unpaired", actor: h.actor, householdId: id });
  return NextResponse.json({ ok: true });
});
