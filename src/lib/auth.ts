// AI-assisted: written with Claude Code from the team's build spec.
// Magic-link login for the family member who runs a household. No passwords:
// an email gets a one-time link, the link sets a session cookie.
//
// Email goes through Resend when RESEND_API_KEY is set. Without it the link
// is logged to the server console and, outside production, handed back to the
// page so local development and the demo still work.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "../db/client";
import { loginTokens, sessions, users, type Household } from "../db/schema";
import { isAdminStrict } from "./admin";
import { publicBaseUrl } from "./twilio";

export const SESSION_COOKIE = "pl_session";
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const e = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null;
}

export type EmailMode = "resend" | "simulated";
export function emailMode(): EmailMode {
  return process.env.RESEND_API_KEY && process.env.RESEND_FROM ? "resend" : "simulated";
}

// Creates a login link for the address and sends it. Returns the link only
// in simulated mode outside production, so the page can show it.
export async function requestLogin(email: string, origin: string, next: string | null): Promise<{ sent: boolean; link?: string }> {
  const raw = token();
  await db.insert(loginTokens).values({ tokenHash: hash(raw), email, expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) });
  const base = publicBaseUrl() ?? origin;
  const link = `${base}/api/auth/verify?token=${raw}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  if (emailMode() === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [email],
        subject: "Your Pilot Light sign-in link",
        text: `Open this link to sign in to Pilot Light. It works once and expires in ${LINK_MINUTES} minutes.\n\n${link}\n\nIf you did not ask for this, ignore it.`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Email failed (HTTP ${res.status}).`);
    return { sent: true };
  }
  console.log(`[auth] SIMULATED sign-in link for ${email}: ${link}`);
  return process.env.NODE_ENV === "production" ? { sent: false } : { sent: false, link };
}

// Burns the link, finds or creates the user, and opens a session. Returns
// the session cookie value to set, or null if the link is bad.
export async function verifyLogin(raw: string): Promise<{ cookie: string; expires: Date } | null> {
  const now = new Date();
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: now })
    .where(and(eq(loginTokens.tokenHash, hash(raw)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, now)))
    .returning({ email: loginTokens.email });
  if (!row) return null;

  const [user] =
    (await db.insert(users).values({ email: row.email }).onConflictDoNothing().returning()).length > 0
      ? await db.select().from(users).where(eq(users.email, row.email))
      : await db.select().from(users).where(eq(users.email, row.email));

  const session = token();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hash(session), userId: user.id, expiresAt: expires });
  return { cookie: session, expires };
}

export async function endSession(raw: string | undefined) {
  if (raw) await db.delete(sessions).where(eq(sessions.tokenHash, hash(raw)));
}

export interface CurrentUser {
  id: string;
  email: string;
  role: "member" | "ems" | "coordinator" | "admin";
  staffTown: string | null;
}

async function userForCookie(raw: string | undefined): Promise<CurrentUser | null> {
  if (!raw) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, role: users.role, staffTown: users.staffTown })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hash(raw)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

// In a route handler.
export function userFromRequest(req: NextRequest): Promise<CurrentUser | null> {
  return userForCookie(req.cookies.get(SESSION_COOKIE)?.value);
}

// In a server component.
export async function userFromCookies(): Promise<CurrentUser | null> {
  return userForCookie((await cookies()).get(SESSION_COOKIE)?.value);
}

// A household with no owner (the seeded demo, or one made before login
// existed) is open by its unguessable link. One with an owner is theirs,
// plus anyone holding the admin token.
export function canAccess(household: Pick<Household, "ownerUserId">, user: CurrentUser | null, admin = false): boolean {
  if (admin) return true;
  if (!household.ownerUserId) return true;
  return user?.id === household.ownerUserId;
}

export async function accessFromRequest(req: NextRequest, household: Pick<Household, "ownerUserId">): Promise<boolean> {
  return canAccess(household, await userFromRequest(req), isAdminStrict(req));
}

export function sessionCookieOptions(expires: Date) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", expires };
}
