// AI-assisted: written with Claude Code from the team's security plan.
// Second factor for staff accounts (EMS, coordinators, administrators).
//   GET   first time: a new authenticator secret and its QR code (stored encrypted until confirmed)
//   POST  { code }: confirms setup, or verifies this session for the next 12 hours
// Codes are rate limited across all servers, and a code can't be used twice.
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { userFromRequest } from "@/lib/auth";
import { bad, handle } from "@/lib/http";
import { audit } from "@/lib/security/audit";
import { open, seal } from "@/lib/security/fieldCrypto";
import { limitedShared } from "@/lib/security/rateLimit";
import { newTotpSecret, otpauthUri, verifyTotp } from "@/lib/security/totp";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const user = await userFromRequest(req);
  if (!user || user.role === "member") return bad("Sign in with a staff account first.", 401);
  if (user.totpEnabled) return NextResponse.json({ enrolled: true });
  // Reuse a setup already in progress, so opening the page twice doesn't invalidate the first QR code.
  const [row] = await db.select({ pending: users.totpPendingSecret }).from(users).where(eq(users.id, user.id));
  const secret = open(row?.pending ?? null) ?? newTotpSecret();
  if (!row?.pending) await db.update(users).set({ totpPendingSecret: seal(secret) }).where(eq(users.id, user.id));
  const uri = otpauthUri(user.email, secret);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#08090A", light: "#FFFFFF" } });
  return NextResponse.json({ enrolled: false, secret, uri, qr }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = handle(async (req: NextRequest) => {
  const user = await userFromRequest(req);
  if (!user || user.role === "member" || !user.sessionHash) return bad("Sign in with a staff account first.", 401);
  const slow = await limitedShared(req, "mfaVerify", user.id);
  if (slow) return slow;
  const body = await req.json();
  const [row] = await db.select({ secret: users.totpSecret, pending: users.totpPendingSecret, last: users.totpLastStep }).from(users).where(eq(users.id, user.id));
  const enrolling = !row.secret;
  const secret = open(enrolling ? row.pending : row.secret);
  if (!secret) return bad("Start setup again: reload this page.", 409);
  const step = verifyTotp(secret, String(body.code ?? ""), Date.now(), enrolling ? null : row.last);
  if (step == null) {
    await audit(req, { action: "staff.mfa_failed", actor: `${user.role}:${user.email}` });
    return bad("That code didn't match. Use the current 6-digit code from your authenticator app.", 401);
  }
  await db
    .update(users)
    .set(enrolling ? { totpSecret: seal(secret), totpPendingSecret: null, totpLastStep: step } : { totpLastStep: step })
    .where(eq(users.id, user.id));
  await db.update(sessions).set({ mfaAt: new Date() }).where(eq(sessions.tokenHash, user.sessionHash));
  await audit(req, { action: enrolling ? "staff.mfa_enrolled" : "staff.mfa_verified", actor: `${user.role}:${user.email}` });
  return NextResponse.json({ ok: true });
});
