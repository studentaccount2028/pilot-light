// AI-assisted: written with Claude Code from the team's build spec and security plan.
// Staff access: the administrator (ADMIN_TOKEN, break-glass) and staff accounts with a role.
//
// The admin token is never accepted in a URL (URLs end up in browser history, server logs and
// Referer headers). It's entered once on a sign-in form (/api/staff/session), which sets a signed,
// expiring cookie; the cookie holds a signature, not the token. Scripts may send it in the
// x-admin-token header. Without ADMIN_TOKEN, admin access is open in local development only.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "pl_admin";
export const ADMIN_HOURS = 12;

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// The token itself (sign-in form, x-admin-token header).
export function tokenMatches(given: string | null | undefined): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  return Boolean(given) && same(given!, token);
}

// The cookie: "<expiry ms>.<HMAC(token, expiry)>", so it proves the token was entered without containing it.
export function adminCookieValue(now = Date.now()): { value: string; expires: Date } {
  const exp = now + ADMIN_HOURS * 3_600_000;
  const sig = createHmac("sha256", process.env.ADMIN_TOKEN ?? "dev").update(`pl-admin:${exp}`).digest("base64url");
  return { value: `${exp}.${sig}`, expires: new Date(exp) };
}

export function adminCookieValid(value: string | null | undefined, now = Date.now()): boolean {
  if (!adminConfigured()) return process.env.NODE_ENV !== "production";
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !(Number(exp) > now)) return false;
  const want = createHmac("sha256", process.env.ADMIN_TOKEN!).update(`pl-admin:${exp}`).digest("base64url");
  return same(sig, want);
}

export function isAdmin(req: NextRequest): boolean {
  if (!adminConfigured()) return process.env.NODE_ENV !== "production";
  return adminCookieValid(req.cookies.get(ADMIN_COOKIE)?.value) || tokenMatches(req.headers.get("x-admin-token"));
}

// Admin only when a token is configured and presented. isAdmin() is open in local development so
// /replay works without setup; ownership checks must not inherit that.
export function isAdminStrict(req: NextRequest): boolean {
  return adminConfigured() && isAdmin(req);
}

export function adminCookieOptions(expires: Date) {
  return { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", expires };
}
