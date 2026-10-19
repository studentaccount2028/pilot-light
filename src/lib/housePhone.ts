// AI-assisted: written with Claude Code from the team's security plan.
// The house phone's credential. A heartbeat means "the power is on and the house is fine", so a fake
// one could hide a real outage. When someone with access turns on "This phone stays at the house",
// the server issues a random token; only its hash is stored. Every heartbeat must present it.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const newHousePhoneToken = () => randomBytes(32).toString("base64url");
export const hashHousePhoneToken = (t: string) => createHash("sha256").update(`pl-house-phone:${t}`).digest("hex");

export type HeartbeatAuth = "ok" | "pair_required" | "bad_token";

// Paired households need the token. An unpaired household with an owner must pair first. An unowned
// household (the seeded demo, opened by its link) keeps working without one.
export function checkHeartbeat(h: { heartbeatTokenHash: string | null; ownerUserId: string | null }, token: string | null): HeartbeatAuth {
  if (h.heartbeatTokenHash) {
    if (!token) return "bad_token";
    const a = Buffer.from(hashHousePhoneToken(token));
    const b = Buffer.from(h.heartbeatTokenHash);
    return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "bad_token";
  }
  return h.ownerUserId ? "pair_required" : "ok";
}
