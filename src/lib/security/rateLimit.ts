// AI-assisted: written with Claude Code from the team's security plan.
// Fixed-window rate limits for the endpoints an attacker would hammer: sign-in links, staff sign-in,
// responder links, heartbeats and power-module reports.
//
// Counts live in this server instance's memory, which is a real but partial defense on serverless
// hosting (each instance counts on its own). For the pilot, put the Vercel firewall's rate limiting
// (or Upstash Redis) in front as well; see docs/security/deployment-checklist.md.
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "../../db/client";

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export const LIMITS = {
  loginRequest: { max: 5, windowMs: 15 * 60_000 },
  staffSignIn: { max: 5, windowMs: 15 * 60_000 },
  responderLink: { max: 60, windowMs: 60_000 },
  heartbeat: { max: 30, windowMs: 60_000 },
  sensorReport: { max: 60, windowMs: 60_000 },
  mfaVerify: { max: 6, windowMs: 15 * 60_000 },
} as const;
export type LimitName = keyof typeof LIMITS;

// Returns the seconds to wait if the caller is over the limit, or 0 if the request may go ahead.
export function hit(name: LimitName, who: string, now = Date.now()): number {
  const { max, windowMs } = LIMITS[name];
  const k = `${name}:${who}`;
  let w = windows.get(k);
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(k, w);
  }
  w.count++;
  if (windows.size > 50_000) for (const [key, v] of windows) if (now >= v.resetAt) windows.delete(key);
  return w.count > max ? Math.ceil((w.resetAt - now) / 1000) : 0;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// A 429 response with Retry-After, or null if the request may go ahead.
export function limited(req: NextRequest, name: LimitName, extra = ""): Response | null {
  const wait = hit(name, clientIp(req) + (extra ? `:${extra}` : ""));
  if (!wait) return null;
  return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment and try again. Call 911 for any emergency." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(wait) },
  });
}

// For tests.
export function resetLimits() {
  windows.clear();
}

// The same limit, counted in the database so every server instance shares it. Used where guessing
// matters most (sign-in links, administrator sign-in, authenticator codes); the busy, low-risk
// endpoints (heartbeats, module reports) use the in-memory count above.
export async function hitShared(name: LimitName, who: string): Promise<number> {
  const { max, windowMs } = LIMITS[name];
  const key = `${name}:${who}`;
  const secs = windowMs / 1000;
  const res = await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${secs}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${secs}) THEN now() ELSE rate_limits.window_start END
    RETURNING count, extract(epoch from (window_start + make_interval(secs => ${secs}) - now()))::int AS wait`);
  const row = res.rows[0] as { count: number; wait: number };
  return row.count > max ? Math.max(1, row.wait) : 0;
}

export async function limitedShared(req: NextRequest, name: LimitName, extra = ""): Promise<Response | null> {
  let wait = 0;
  try {
    wait = await hitShared(name, clientIp(req) + (extra ? `:${extra}` : ""));
  } catch (err) {
    // If the database is unreachable, fall back to this instance's count rather than failing open.
    console.error("[rate-limit] shared counter unavailable", err instanceof Error ? err.message : err);
    return limited(req, name, extra);
  }
  if (!wait) return null;
  return new Response(JSON.stringify({ error: "Too many attempts. Please wait a few minutes and try again." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(wait) },
  });
}
