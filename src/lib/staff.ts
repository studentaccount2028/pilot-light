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
  // Staff roles count only after the second factor (authenticator code) in this session.
  if (user.role !== "member" && !user.mfaFresh) return null;
  if (user.role === "admin") return { kind: "admin" };
  if (user.role === "ems") return { kind: "ems", email: user.email };
  if (user.role === "coordinator" && user.staffTown) return { kind: "coordinator", email: user.email, town: user.staffTown };
  return null;
}

export async function staffFromRequest(req: NextRequest): Promise<Staff | null> {
  return staffFor(isAdmin(req) ? null : await userFromRequest(req), isAdmin(req));
}

export async function staffFromCookies(): Promise<Staff | null> {
  return (await staffAccess()).staff;
}

// For staff pages: who this is, and what's missing if they can't get in yet.
//   signin  nobody signed in (or a family account)      enroll  staff role, no authenticator yet
//   verify  staff role, authenticator code needed now
export async function staffAccess(): Promise<{ staff: Staff | null; need: "signin" | "enroll" | "verify" | null; email?: string }> {
  const admin = adminCookieValid((await cookies()).get(ADMIN_COOKIE)?.value);
  if (admin) return { staff: { kind: "admin" }, need: null };
  const user = await userFromCookies();
  const staff = staffFor(user, false);
  if (staff) return { staff, need: null };
  if (!user || user.role === "member") return { staff: null, need: "signin" };
  return { staff: null, need: user.totpEnabled ? "verify" : "enroll", email: user.email };
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
