// AI-assisted: written with Claude Code from the team's build spec.
// The risk score and what each tier changes about the ladder.
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeRisk, recommendContact, type RiskInput } from "../src/lib/engine/risk";
import { decide, recipientsFor, type AlertLike, type StateLike } from "../src/lib/engine/rules";
import { thresholdSms } from "../src/lib/messages";

const mom: RiskInput = { residentName: "Mom", age: 82, livesAlone: true, canLeaveUnassisted: true, canReachBackup: true, backupHours: 4, prompt: "confirmed" };

test("stable: prepared, replied to the prompt, backup within reach", () => {
  const r = computeRisk(mom);
  assert.equal(r.tier, "stable");
  assert.equal(r.score, 1); // alone 2 + age 1 - replied 2
  assert.match(r.reason ?? "", /replied to the storm prompt/);
});

test("check: no reply to the storm prompt is never stable", () => {
  assert.equal(computeRisk({ ...mom, prompt: "no_reply" }).tier, "check");
  const young = computeRisk({ ...mom, age: 60, livesAlone: false, prompt: "no_reply" });
  assert.equal(young.score, 2);
  assert.equal(young.tier, "check");
  assert.match(young.reason ?? "", /did not reply/);
});

test("check first: cannot leave unassisted and alone, whatever else is true", () => {
  const r = computeRisk({ ...mom, age: 60, canLeaveUnassisted: false });
  assert.equal(r.tier, "check_first");
  assert.match(r.reason ?? "", /cannot leave the house unassisted and lives alone/);
});

test("check first by points: no backup, alone and 85+", () => {
  const r = computeRisk({ ...mom, age: 88, backupHours: 0, prompt: "not_sent" });
  assert.equal(r.score, 7);
  assert.equal(r.tier, "check_first");
});

test("unanswered questions score nothing and are listed as not answered", () => {
  const r = computeRisk({ residentName: null, age: null, livesAlone: null, canLeaveUnassisted: null, canReachBackup: null, backupHours: 8, prompt: "not_sent" });
  assert.equal(r.score, 0);
  assert.equal(r.tier, "stable");
  assert.equal(r.factors.filter((f) => f.state === "unknown").length, 5);
});

const c = (id: string, priority: number, extra = {}) => ({ id, name: id, phone: `+1603555010${priority}`, priority, channel: "sms" as const, isTownVolunteer: false, active: true, ...extra });
const people = [c("a", 1), c("b", 2), c("c", 3), c("v", 4, { isTownVolunteer: true })];

test("ladder by tier: check adds the volunteer early, check first reaches everyone at once", () => {
  assert.deepEqual(recipientsFor("h6", people, true, "stable").map((x) => x.id), ["a"]);
  assert.deepEqual(recipientsFor("h6", people, true, "check").map((x) => x.id), ["a", "v"]);
  assert.deepEqual(recipientsFor("h6", people, true, "check_first").map((x) => x.id), ["a", "b", "c", "v"]);
  // Never the volunteer without consent to share with the town.
  assert.deepEqual(recipientsFor("h6", people, false, "check_first").map((x) => x.id), ["a", "b", "c"]);
});

test("higher tiers do not wait for the 6 h mark", () => {
  const T0 = new Date("2025-12-29T12:00:00Z");
  const at = (m: number) => new Date(T0.getTime() + m * 60_000);
  const warning: AlertLike = { id: "w", event: "Winter Storm Warning", zones: ["NHZ006"], onset: at(-60), expires: at(600) };
  const state: StateLike = { status: "normal", outageInferredAt: null, countdownZeroAt: null, lastHeartbeatAt: at(-25), activeAlertId: null, resolvedReason: null };
  const chair = [{ label: "Power chair", backupHours: 12 }];
  assert.equal(decide({ now: T0, state, warning, devices: chair, tier: "stable" }).fire, null);
  assert.equal(decide({ now: T0, state, warning, devices: chair, tier: "check" }).fire, "h6");
  assert.equal(decide({ now: T0, state, warning, devices: chair, tier: "check_first" }).fire, "h6");
});

test("recommended contact for each tier", () => {
  const resident = { name: "Mom", phone: "+16035550100" };
  assert.equal(recommendContact("stable", resident, people, true)?.name, "a");
  assert.equal(recommendContact("check", resident, people, true)?.name, "Mom");
  assert.equal(recommendContact("check", { name: "Mom", phone: null }, people, true)?.name, "a");
  // The top tier goes to 911, never to a family member.
  assert.equal(recommendContact("check_first", resident, people, true)?.phone, "911");
  assert.equal(recommendContact("check_first", resident, people, false)?.phone, "911");
});

test("check first leads the message with 911 guidance", () => {
  const ctx = { label: "Mom's house", town: "Ossipee", address: "1 Main St", deviceLabel: "Portable O2", remainingMs: 3.5 * 3_600_000, residentName: "Mom", residentPhone: "+16035550100" };
  const first = thresholdSms("h6", { ...ctx, tier: "check_first", reason: "Mom cannot leave the house unassisted and lives alone." }, { volunteer: false });
  assert.match(first, /^PILOT LIGHT: Call Mom now; if no answer in 10 minutes, call 911\./);
  const check = thresholdSms("h6", { ...ctx, tier: "check", reason: "Mom did not reply to the storm prompt." }, { volunteer: false });
  assert.match(check, /did not reply to the storm prompt\. Please call Mom now/);
  const volunteer = thresholdSms("h6", { ...ctx, tier: "check", reason: null }, { volunteer: true });
  assert.match(volunteer, /Address: 1 Main St\. Phone: \+16035550100\..*CHECKED/);
});
