// AI-assisted: written with Claude Code from the team's security plan.
// Who is allowed to see what, in one place.
//
//   admin        everything, including the storm replay (break-glass; ADMIN_TOKEN)
//   ems          the EMS board: every household shared with EMS, entry notes included
//   coordinator  one town's volunteer roster (their staffTown)
//   member       their own households only (src/lib/auth.ts canAccess)
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, adminCookieValid, isAdmin } from "./admin";
import { userFromCookies, userFromRequest, type CurrentUser } from "./auth";

export type Staff = { kind: "admin" } | { kind: "ems"; email: string } | { kind: "coordinator"; email: string; town: string };

export function staffFor(user: CurrentUser | null, admin: boolean): Staff | null {
  if (admin) return { kind: "admin" };
  if (!user) return null;
  if (user.role === "admin") return { kind: "admin" };
  if (user.role === "ems") return { kind: "ems", email: user.email };
  if (user.role === "coordinator" && user.staffTown) return { kind: "coordinator", email: user.email, town: user.staffTown };
  return null;
}

export async function staffFromRequest(req: NextRequest): Promise<Staff | null> {
  return staffFor(isAdmin(req) ? null : await userFromRequest(req), isAdmin(req));
}

export async function staffFromCookies(): Promise<Staff | null> {
  const admin = adminCookieValid((await cookies()).get(ADMIN_COOKIE)?.value);
  return staffFor(admin ? null : await userFromCookies(), admin);
}

export const canSeeEms = (s: Staff | null) => s?.kind === "admin" || s?.kind === "ems";
export const canRunReplay = (s: Staff | null) => s?.kind === "admin";
export function canSeeTown(s: Staff | null, town: string): boolean {
  if (s?.kind === "admin" || s?.kind === "ems") return true;
  return s?.kind === "coordinator" && s.town.trim().toLowerCase() === town.trim().toLowerCase();
}

// How the staff member appears in the audit log.
export function actorOf(s: Staff): string {
  return s.kind === "admin" ? "admin" : `${s.kind}:${s.email}`;
}
