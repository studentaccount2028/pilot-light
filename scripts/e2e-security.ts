// AI-assisted: written with Claude Code from the team's security plan.
// End-to-end security check against a running server and its database. Run against a TEST database
// only (it creates and deletes accounts and a household):
//   BASE_URL=http://localhost:3999 DATABASE_URL=... ADMIN_TOKEN=... CRON_SECRET=... FIELD_ENCRYPTION_KEY=... \
//     npx tsx scripts/e2e-security.ts
// Each check prints PASS or FAIL; exits non-zero on any failure.
import "./_env";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { loginTokens, users } from "../src/db/schema";
import { stepOf, totpAt } from "../src/lib/security/totp";

const BASE = process.env.BASE_URL ?? "http://localhost:3999";
const DEMO = "00000000-0000-4000-8000-000000000001";
let failures = 0;
const check = (ok: boolean, what: string, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

// A browser with its own cookies.
class Client {
  cookies = new Map<string, string>();
  constructor(public ip: string) {}
  async req(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("x-real-ip", this.ip);
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      if (v.join("=")) this.cookies.set(k, v.join("="));
      else this.cookies.delete(k);
    }
    return res;
  }
  json = async (path: string, init: RequestInit = {}) => {
    const res = await this.req(path, init);
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  // Same as clicking the emailed link: a one-time token in the database, then /api/auth/verify.
  async signIn(email: string, next = "/") {
    const raw = randomBytes(32).toString("base64url");
    await db.insert(loginTokens).values({ tokenHash: createHash("sha256").update(raw).digest("hex"), email, expiresAt: new Date(Date.now() + 600_000) });
    return this.req(`/api/auth/verify?token=${raw}&next=${encodeURIComponent(next)}`);
  }
  async enrollMfa() {
    const setup = await this.json("/api/staff/mfa");
    const secret = String(setup.body.secret ?? "");
    const bad = await this.json("/api/staff/mfa", { method: "POST", body: JSON.stringify({ code: "000000" }) });
    const good = await this.json("/api/staff/mfa", { method: "POST", body: JSON.stringify({ code: totpAt(secret, stepOf(Date.now())) }) });
    return { setup, bad, good };
  }
}

const grant = (email: string, role: "member" | "ems" | "coordinator" | "admin", town: string | null = null) =>
  db.insert(users).values({ email, role, staffTown: town }).onConflictDoUpdate({ target: users.email, set: { role, staffTown: town } });

async function main() {
  const run = Date.now().toString(36);
  const family = new Client("10.0.0.1"), stranger = new Client("10.0.0.2"), ems = new Client("10.0.0.3"), coord = new Client("10.0.0.4"), admin = new Client("10.0.0.5"), attacker = new Client("10.0.0.6");

  // Headers
  const home = await family.req("/");
  check(home.headers.get("referrer-policy") === "no-referrer" && home.headers.get("x-frame-options") === "DENY" && Boolean(home.headers.get("strict-transport-security")), "security headers on every page");

  // Sign-in and the open redirect
  const signin = await family.signIn(`family-${run}@example.com`, "/\\evil.com");
  check(signin.status === 307 || signin.status === 302 || signin.status === 303, "sign-in link works", `status ${signin.status}`);
  check(new URL(signin.headers.get("location") ?? "/", BASE).host === new URL(BASE).host, "sign-in can't redirect to another site (/\\evil.com)", signin.headers.get("location") ?? "");
  await stranger.signIn(`stranger-${run}@example.com`);

  // A real owned household with entry notes
  const create = await family.json("/api/households", {
    method: "POST",
    body: JSON.stringify({
      label: `E2E house ${run}`, address: "1 Main St, Center Ossipee, NH", town: "Ossipee", lat: 43.6863, lng: -71.1181, utility: "eversource",
      accessNotes: "Side door. Lockbox 4412.", devices: [{ type: "o2_concentrator", label: "Portable oxygen concentrator", backupHours: 4 }],
      contacts: [{ name: "Sarah", phone: "603 555 0142", channel: "sms" }],
    }),
  });
  const id = String(create.body.id ?? "");
  check(create.status === 201 && Boolean(id), "family creates an owned household", JSON.stringify(create.body));
  if (!id) throw new Error("Can't continue without a household.");
  const stored = ((await db.execute(sql`SELECT access_notes FROM households WHERE id = ${id}`)).rows[0] as { access_notes: string }).access_notes;
  check(stored.startsWith("enc:v1:") && !stored.includes("4412"), "entry notes are encrypted in the database");
  const mine = await family.json(`/api/households/${id}`);
  const hh = mine.body.household as Record<string, unknown> | undefined;
  check(hh?.accessNotes === "Side door. Lockbox 4412.", "the owner sees the notes decrypted");
  check(hh != null && !("heartbeatTokenHash" in hh), "the house-phone token hash never leaves the server");
  check((await stranger.json(`/api/households/${id}`)).status === 403, "another signed-in user can't open the household");

  // Heartbeats
  const hb = (c: Client, hid: string, token?: string) =>
    c.json("/api/heartbeat", { method: "POST", body: JSON.stringify({ household_id: hid }), headers: token ? { authorization: `Bearer ${token}` } : {} });
  check((await hb(attacker, id)).status === 401, "a fake heartbeat for an owned house is rejected");
  check((await stranger.json(`/api/households/${id}/house-phone`, { method: "POST" })).status === 401, "a stranger can't pair a phone to someone else's house");
  const paired = await family.json(`/api/households/${id}/house-phone`, { method: "POST" });
  const token = String(paired.body.token ?? "");
  check(paired.status === 200 && token.length > 30, "the owner pairs the house phone");
  check((await hb(family, id, token)).status === 200, "the paired phone's heartbeat is accepted");
  check((await hb(attacker, id, randomBytes(32).toString("base64url"))).status === 401, "a guessed token is rejected");
  check((await hb(attacker, DEMO)).status === 200, "the unowned demo house still works without pairing");

  // EMS account: two-factor required
  await grant(`medic-${run}@example.org`, "ems");
  await ems.signIn(`medic-${run}@example.org`);
  check((await ems.json("/api/ems")).status === 401, "an EMS account can't see the board before its authenticator code");
  const m = await ems.enrollMfa();
  check(Boolean(m.setup.body.qr) && m.bad.status === 401 && m.good.status === 200, "authenticator setup: wrong code refused, right code accepted");
  check((await ems.json("/api/ems")).status === 200, "after two-factor the EMS board opens");
  check((await family.json("/api/ems")).status === 401, "a family account can't open the EMS board");
  check((await attacker.json("/api/ems")).status === 401, "nobody signed out can open the EMS board");

  // Coordinator: one town only
  await grant(`coord-${run}@example.org`, "coordinator", "Ossipee");
  await coord.signIn(`coord-${run}@example.org`);
  await coord.enrollMfa();
  check((await coord.json("/api/town/Ossipee")).status === 200, "a coordinator sees their own town's roster");
  check((await coord.json("/api/town/Tamworth")).status === 401, "a coordinator can't see another town");
  check((await coord.json("/api/ems")).status === 401, "a coordinator can't open the EMS board");

  // Administrator
  const key = process.env.ADMIN_TOKEN ?? "";
  check((await attacker.json(`/api/replay?key=${encodeURIComponent(key)}`)).status === 401, "the admin key in a URL no longer works");
  check((await admin.json("/api/staff/session", { method: "POST", body: JSON.stringify({ token: "wrong" }) })).status === 401, "a wrong admin key is refused");
  const ok = await admin.json("/api/staff/session", { method: "POST", body: JSON.stringify({ token: key }) });
  const cookie = admin.cookies.get("pl_admin") ?? "";
  check(ok.status === 200 && Boolean(cookie) && !cookie.includes(key.slice(0, 12)), "admin sign-in sets a cookie that doesn't contain the key");
  check((await admin.json("/api/replay")).status === 200, "the admin opens the storm replay");

  // Audit log
  const actions = (await db.execute(sql`SELECT DISTINCT action FROM audit_log`)).rows.map((r) => (r as { action: string }).action);
  for (const a of ["household.house_phone_paired", "staff.mfa_enrolled", "staff.mfa_failed", "staff.sign_in", "staff.sign_in_failed"]) check(actions.includes(a), `audit log records ${a}`);

  // Scheduled job with security maintenance
  const cron = await attacker.json("/api/cron/tick", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  check(cron.status === 200 && Boolean(cron.body.security), "the daily job runs security maintenance", JSON.stringify(cron.body).slice(0, 160));
  check((await attacker.json("/api/cron/tick")).status === 401, "the daily job refuses callers without its secret");

  // Encrypting notes saved before encryption
  execFileSync("npx", ["tsx", "scripts/encrypt-existing.ts"], { stdio: "pipe", env: process.env });
  const plainLeft = Number(((await db.execute(sql`SELECT count(*) AS n FROM households WHERE access_notes IS NOT NULL AND access_notes NOT LIKE 'enc:v1:%'`)).rows[0] as { n: string }).n);
  check(plainLeft === 0, "encrypt-existing leaves no plain-text entry notes");

  // Deletion
  check((await stranger.json(`/api/households/${id}`, { method: "DELETE" })).status === 403, "a stranger can't delete the household");
  check((await family.json(`/api/households/${id}`, { method: "DELETE" })).status === 200, "the owner deletes the household");
  const left = Number(((await db.execute(sql`SELECT (SELECT count(*) FROM households WHERE id = ${id}) + (SELECT count(*) FROM devices WHERE household_id = ${id}) + (SELECT count(*) FROM contacts WHERE household_id = ${id}) AS n`)).rows[0] as { n: string }).n);
  check(left === 0, "deleting removes the household, its devices and its contacts");

  // Rate limit (last: it locks this test's attacker address for a while)
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) codes.push((await attacker.json("/api/staff/session", { method: "POST", body: JSON.stringify({ token: `guess-${i}` }) })).status);
  check(codes.slice(0, 5).every((c) => c === 401) && codes.slice(5).every((c) => c === 429), "admin-key guessing is cut off after 5 tries", codes.join(","));

  await db.delete(users).where(eq(users.email, `medic-${run}@example.org`));
  await db.delete(users).where(eq(users.email, `coord-${run}@example.org`));
  console.log(`\n${failures ? `${failures} FAILED` : "All checks passed."}`);
  await closeDb();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
