// AI-assisted: written with Claude Code from the team's security plan.
// Administrator sign-in: POST { token } sets a signed 12-hour cookie; DELETE signs out.
// Rate limited, and every attempt is in the audit log.
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminConfigured, adminCookieOptions, adminCookieValue, tokenMatches } from "@/lib/admin";
import { bad, handle } from "@/lib/http";
import { audit } from "@/lib/security/audit";
import { limitedShared } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const slow = await limitedShared(req, "staffSignIn");
  if (slow) return slow;
  if (!adminConfigured() && process.env.NODE_ENV === "production") return bad("Administrator sign-in is not configured.", 503);
  const body = await req.json();
  if (typeof body.token !== "string" || !tokenMatches(body.token)) {
    await audit(req, { action: "staff.sign_in_failed", actor: "admin" });
    return bad("That access key is not right.", 401);
  }
  const { value, expires } = adminCookieValue();
  await audit(req, { action: "staff.sign_in", actor: "admin" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, value, adminCookieOptions(expires));
  return res;
});

export const DELETE = handle(async (req: NextRequest) => {
  await audit(req, { action: "staff.sign_out", actor: "admin" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...adminCookieOptions(new Date(0)), maxAge: 0 });
  return res;
});
