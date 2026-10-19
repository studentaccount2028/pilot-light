// AI-assisted: written with Claude Code from the team's security plan.
// The security controls, each checked directly.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import nextConfig from "../next.config";
import { adminCookieValid, adminCookieValue, tokenMatches } from "../src/lib/admin";
import { checkHeartbeat, hashHousePhoneToken, newHousePhoneToken } from "../src/lib/housePhone";
import { thresholdSms } from "../src/lib/messages";
import { isSealed, open, seal } from "../src/lib/security/fieldCrypto";
import { safeNextPath } from "../src/lib/security/paths";
import { hit, LIMITS, resetLimits } from "../src/lib/security/rateLimit";
import { canRunReplay, canSeeEms, canSeeTown, staffFor } from "../src/lib/staff";
import { base32Encode, otpauthUri, totpAt, verifyTotp } from "../src/lib/security/totp";

process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.ADMIN_TOKEN = "correct-horse-battery-staple";

test("entry notes are encrypted at rest and decrypt back exactly", () => {
  const notes = "Side door off the driveway; lockbox code 4412. Small friendly dog.";
  const stored = seal(notes)!;
  assert.ok(isSealed(stored));
  assert.ok(!stored.includes("4412"), "the code must not appear in the stored value");
  assert.equal(open(stored), notes);
  assert.notEqual(seal(notes), seal(notes), "a fresh IV each time: equal notes don't look equal");
  assert.equal(open("plain legacy note"), "plain legacy note");
  assert.equal(seal(null), null);
});

test("tampering with an encrypted value is detected", () => {
  const stored = seal("lockbox 4412")!;
  const parts = stored.split(".");
  const body = Buffer.from(parts[2], "base64url");
  body[0] ^= 1;
  assert.throws(() => open([parts[0], parts[1], body.toString("base64url")].join(".")));
});

test("rate limits allow the limit, then refuse until the window resets", () => {
  resetLimits();
  const { max, windowMs } = LIMITS.loginRequest;
  for (let i = 0; i < max; i++) assert.equal(hit("loginRequest", "1.2.3.4", 1_000), 0);
  assert.ok(hit("loginRequest", "1.2.3.4", 1_000) > 0, "one over the limit is refused");
  assert.equal(hit("loginRequest", "5.6.7.8", 1_000), 0, "other callers are unaffected");
  assert.equal(hit("loginRequest", "1.2.3.4", 1_000 + windowMs), 0, "allowed again after the window");
});

test("sign-in redirects stay on this site", () => {
  assert.equal(safeNextPath("/h/123"), "/h/123");
  for (const evil of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/ok\u0000", "/a\\b", null, 42]) {
    assert.equal(safeNextPath(evil), null, String(evil));
  }
});

test("the admin cookie proves the token without containing it, and expires", () => {
  assert.ok(tokenMatches("correct-horse-battery-staple"));
  assert.ok(!tokenMatches("wrong"));
  const now = Date.now();
  const { value } = adminCookieValue(now);
  assert.ok(!value.includes("correct-horse"), "the cookie never holds the token");
  assert.ok(adminCookieValid(value, now));
  assert.ok(!adminCookieValid(value, now + 13 * 3_600_000), "expired after 12 hours");
  const [exp] = value.split(".");
  assert.ok(!adminCookieValid(`${Number(exp) + 3_600_000}.${value.split(".")[1]}`, now), "can't extend the expiry");
  assert.ok(!adminCookieValid(`${exp}.forged`, now));
});

test("roles: EMS sees the board, a coordinator only their town, only the admin runs the replay", () => {
  const ems = staffFor({ id: "1", email: "medic@pafd.org", role: "ems", staffTown: null, mfaFresh: true }, false);
  const coord = staffFor({ id: "2", email: "c@ossipee.org", role: "coordinator", staffTown: "Ossipee", mfaFresh: true }, false);
  const family = staffFor({ id: "3", email: "f@example.com", role: "member", staffTown: null }, false);
  const admin = staffFor(null, true);
  assert.ok(canSeeEms(ems) && canSeeEms(admin));
  assert.ok(!canSeeEms(coord) && !canSeeEms(family) && !canSeeEms(null));
  assert.ok(canSeeTown(coord, "ossipee") && !canSeeTown(coord, "Tamworth"));
  assert.ok(!canSeeTown(family, "Ossipee") && !canSeeTown(null, "Ossipee"));
  assert.ok(canRunReplay(admin) && !canRunReplay(ems) && !canRunReplay(coord));
  assert.equal(staffFor({ id: "4", email: "x@y.z", role: "coordinator", staffTown: null, mfaFresh: true }, false), null, "a coordinator without a town gets nothing");
  assert.equal(staffFor({ id: "5", email: "medic@pafd.org", role: "ems", staffTown: null, mfaFresh: false }, false), null, "no staff access until the authenticator code is entered");
});

test("heartbeats need the house phone's token; a fake one can't silence an outage", () => {
  const token = newHousePhoneToken();
  const paired = { heartbeatTokenHash: hashHousePhoneToken(token), ownerUserId: "u1" };
  assert.equal(checkHeartbeat(paired, token), "ok");
  assert.equal(checkHeartbeat(paired, null), "bad_token");
  assert.equal(checkHeartbeat(paired, newHousePhoneToken()), "bad_token");
  assert.equal(checkHeartbeat({ heartbeatTokenHash: null, ownerUserId: "u1" }, null), "pair_required");
  assert.equal(checkHeartbeat({ heartbeatTokenHash: null, ownerUserId: null }, null), "ok", "the unowned demo house still works");
});

test("a volunteer's text names no medical device, address or phone when they have a link", () => {
  const ctx = { label: "Mom's house", town: "Ossipee", address: "1 Main St", deviceLabel: "Portable oxygen concentrator", remainingMs: 2 * 3_600_000, residentName: "Mom", residentPhone: "+16035550100" };
  const volunteer = thresholdSms("h2", ctx, { volunteer: true, link: "https://x.test/r/abc" });
  for (const secret of ["oxygen", "1 Main St", "+16035550100"]) assert.ok(!volunteer.includes(secret), `volunteer text leaks ${secret}`);
  assert.match(volunteer, /What to do: https:\/\/x\.test\/r\/abc$/);
  const family = thresholdSms("h2", ctx, { volunteer: false, link: "https://x.test/r/def" });
  assert.match(family, /oxygen/, "family still gets the full picture");
});

test("every page sends the security headers; personal pages are never cached", async () => {
  const rules = await nextConfig.headers!();
  const all = rules.find((r) => r.source === "/:path*")!.headers;
  const get = (k: string) => all.find((h) => h.key === k)?.value;
  assert.equal(get("Referrer-Policy"), "no-referrer");
  assert.equal(get("X-Frame-Options"), "DENY");
  assert.match(get("Strict-Transport-Security") ?? "", /max-age=63072000/);
  assert.ok(all.some((h) => /Content-Security-Policy/.test(h.key) && /frame-ancestors 'none'/.test(h.value)));
  const responder = rules.find((r) => r.source === "/r/:path*")!.headers;
  assert.ok(responder.some((h) => h.key === "Cache-Control" && h.value === "no-store"));
});

test("authenticator codes match the RFC 6238 standard and can't be replayed", () => {
  // RFC 6238 appendix B: secret "12345678901234567890", T = 59 s, SHA-1 -> 94287082 (6 digits: 287082)
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(totpAt(secret, 1), "287082");
  // T = 1111111109 -> 07081804
  assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), "081804");
  const now = 1111111109_000;
  const step = verifyTotp(secret, "081804", now);
  assert.equal(step, Math.floor(1111111109 / 30));
  assert.equal(verifyTotp(secret, "081804", now, step), null, "the same code can't be used twice");
  assert.equal(verifyTotp(secret, "000000", now), null);
  assert.equal(verifyTotp(secret, "12345", now), null);
  assert.match(otpauthUri("medic@pafd.org", secret), /^otpauth:\/\/totp\/Pilot%20Light%3Amedic%40pafd\.org\?secret=GEZD/);
});
