// AI-assisted: written with Claude Code from the team's build spec.
// Gate for /replay and the town roster. With ADMIN_TOKEN set, the caller must
// present it (cookie, header or ?key=). Without it, access is open in local
// development only and closed in production.
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "pl_admin";

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}

export function tokenMatches(given: string | null | undefined): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAdmin(req: NextRequest): boolean {
  if (!adminConfigured()) return process.env.NODE_ENV !== "production";
  return (
    tokenMatches(req.cookies.get(ADMIN_COOKIE)?.value) ||
    tokenMatches(req.headers.get("x-admin-token")) ||
    tokenMatches(req.nextUrl.searchParams.get("key"))
  );
}
