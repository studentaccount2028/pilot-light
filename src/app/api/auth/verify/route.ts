// AI-assisted: written with Claude Code from the team's build spec.
// The link in the email lands here: burn the token, set the session cookie, go on.
import { safeNextPath } from "@/lib/security/paths";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, verifyLogin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("token") ?? "";
  const next = req.nextUrl.searchParams.get("next");
  const safeNext = safeNextPath(next) ?? "/";
  const session = raw ? await verifyLogin(raw).catch(() => null) : null;
  if (!session) return NextResponse.redirect(new URL("/login?error=expired", req.nextUrl.origin));
  const res = NextResponse.redirect(new URL(safeNext, req.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE, session.cookie, sessionCookieOptions(session.expires));
  return res;
}
