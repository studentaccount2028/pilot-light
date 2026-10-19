// AI-assisted: written with Claude Code from the team's security plan.
// The audit log: who looked at or changed sensitive information, and when. Every view of a home's
// entry notes by EMS or a responder is recorded, so a department can answer "who saw this house's
// lockbox code?" IP addresses are stored only as a salted hash.
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "../../db/client";
import { auditLog } from "../../db/schema";
import { clientIp } from "./rateLimit";

export type AuditAction =
  | "staff.sign_in"
  | "staff.sign_in_failed"
  | "staff.sign_out"
  | "staff.mfa_enrolled"
  | "staff.mfa_verified"
  | "staff.mfa_failed"
  | "ems.board_viewed"
  | "ems.status_updated"
  | "town.roster_viewed"
  | "town.marked_checked"
  | "responder.link_opened"
  | "responder.action"
  | "household.house_phone_paired"
  | "household.house_phone_unpaired"
  | "household.deleted"
  | "replay.control";

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${process.env.AUDIT_IP_SALT ?? "pilot-light"}:${ip}`).digest("hex").slice(0, 32);
}

// Never throws: a failed audit write is reported in the server log but doesn't block the action.
export async function audit(req: NextRequest | null, entry: { action: AuditAction; actor: string; householdId?: string | null; detail?: string | null }) {
  try {
    await db.insert(auditLog).values({
      action: entry.action,
      actor: entry.actor.slice(0, 200),
      householdId: entry.householdId ?? null,
      detail: entry.detail?.slice(0, 500) ?? null,
      ipHash: req ? hashIp(clientIp(req)) : null,
    });
  } catch (err) {
    console.error("[audit] write failed", entry.action, err instanceof Error ? err.message : err);
  }
}

// For views that poll (the EMS board refreshes every few seconds): one entry per actor and subject
// every 10 minutes, not one per refresh.
const recent = new Map<string, number>();
export async function auditOncePer(req: NextRequest | null, key: string, entry: Parameters<typeof audit>[1], windowMs = 10 * 60_000) {
  const now = Date.now();
  const k = `${entry.action}|${entry.actor}|${key}`;
  if ((recent.get(k) ?? 0) > now) return;
  recent.set(k, now + windowMs);
  if (recent.size > 20_000) for (const [x, until] of recent) if (until <= now) recent.delete(x);
  await audit(req, entry);
}
