// AI-assisted: written with Claude Code from the team's build spec.
// The seven rules, against fixtures. No database, no network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeThreshold, channelsFor, decide, findActiveWarning, isSilent, limitingDevice, recipientsFor, type AlertLike, type StateLike } from "../src/lib/engine/rules";
import { parseDigit, parseEtaMinutes, parseReply } from "../src/lib/inbound";
import { formatRemaining, thresholdSms, voiceTwiml } from "../src/lib/messages";
import { alertRow } from "../src/lib/nws";
import { expectedSignature, normalizePhone, validateSignature } from "../src/lib/twilio";

const T0 = new Date("2025-12-29T12:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const warning: AlertLike = { id: "w1", event: "Winter Storm Warning", zones: ["NHZ006"], onset: at(-60), expires: at(600) };
const idle: StateLike = { status: "normal", outageInferredAt: null, countdownZeroAt: null, lastHeartbeatAt: at(-5), activeAlertId: null, resolvedReason: null };
const o2 = { label: "Portable O2", backupHours: 4 };

test("rule 1: only the four warning types, in zone, inside the time window", () => {
  assert.equal(findActiveWarning([warning], "NHZ006", T0)?.id, "w1");
  assert.equal(findActiveWarning([warning], "NHZ010", T0), null);
  assert.equal(findActiveWarning([{ ...warning, event: "Winter Weather Advisory" }], "NHZ006", T0), null);
  // Wind Advisory arms the watch (added after the outage backtest).
  assert.equal(findActiveWarning([{ ...warning, event: "Wind Advisory" }], "NHZ006", T0)?.event, "Wind Advisory");
  assert.equal(findActiveWarning([warning], "NHZ006", at(-61)), null);
  assert.equal(findActiveWarning([warning], "NHZ006", at(600)), null);
});

test("rule 2: silent only after more than 20 minutes, never without a baseline", () => {
  assert.equal(isSilent(at(-20), T0), false);
  assert.equal(isSilent(at(-21), T0), true);
  assert.equal(isSilent(null, T0), false);
});

test("a warning alone only arms the watch", () => {
  const d = decide({ now: T0, state: idle, warning, devices: [o2] });
  assert.equal(d.status, "warning_active");
  assert.equal(d.fire, null);
});

test("silence alone does nothing", () => {
  const d = decide({ now: T0, state: { ...idle, lastHeartbeatAt: at(-600) }, warning: null, devices: [o2] });
  assert.equal(d.status, "normal");
  assert.equal(d.fire, null);
});

test("rule 3: warning plus silence infers the outage from the last heartbeat", () => {
  const d = decide({ now: T0, state: { ...idle, lastHeartbeatAt: at(-25) }, warning, devices: [o2] });
  assert.equal(d.status, "countdown");
  assert.deepEqual(d.outageInferredAt, at(-25));
  assert.deepEqual(d.countdownZeroAt, at(-25 + 240));
  assert.equal(d.fire, "h6");
});

test("rule 3: a phone that went quiet before the storm is dated to the warning's onset", () => {
  const d = decide({ now: T0, state: { ...idle, lastHeartbeatAt: at(-3000) }, warning, devices: [o2] });
  assert.deepEqual(d.outageInferredAt, warning.onset);
});

test("rule 4: shortest backup wins, and no backup means zero", () => {
  assert.equal(limitingDevice([o2, { label: "CPAP", backupHours: 8 }]).hours, 4);
  assert.equal(limitingDevice([o2, { label: "Stationary O2", backupHours: null }]).hours, 0);
  const d = decide({ now: T0, state: { ...idle, lastHeartbeatAt: at(-25) }, warning, devices: [{ label: "Stationary O2", backupHours: null }] });
  assert.equal(d.fire, "h0");
});

test("more than 6 hours left is a probable outage with nothing sent yet", () => {
  const d = decide({ now: T0, state: { ...idle, lastHeartbeatAt: at(-25) }, warning, devices: [{ label: "Chair", backupHours: 12 }] });
  assert.equal(d.status, "probable_outage");
  assert.equal(d.fire, null);
});

test("rule 5: thresholds at 6 h, 2 h and 0 h, most severe only", () => {
  const h = 3_600_000;
  assert.equal(activeThreshold(6 * h + 1), null);
  assert.equal(activeThreshold(6 * h), "h6");
  assert.equal(activeThreshold(2 * h), "h2");
  assert.equal(activeThreshold(0), "h0");
  assert.equal(activeThreshold(-5 * h), "h0");
});

test("rule 6: a heartbeat during an incident resolves it and sends one all-clear", () => {
  const inIncident: StateLike = { status: "countdown", outageInferredAt: at(-25), countdownZeroAt: at(215), lastHeartbeatAt: at(-1), activeAlertId: "w1", resolvedReason: null };
  const d = decide({ now: T0, state: inIncident, warning, devices: [o2] });
  assert.equal(d.status, "resolved");
  assert.equal(d.allClear, true);
  const next = decide({ now: at(1), state: d, warning, devices: [o2] });
  assert.equal(next.status, "warning_active");
  assert.equal(next.allClear, false);
});

test("rule 7: after HELP the ladder stays stopped for the rest of the storm", () => {
  const helped: StateLike = { status: "resolved", outageInferredAt: at(-25), countdownZeroAt: at(215), lastHeartbeatAt: at(-25), activeAlertId: "w1", resolvedReason: "help" };
  const d = decide({ now: at(300), state: helped, warning, devices: [o2] });
  assert.equal(d.status, "resolved");
  assert.equal(d.fire, null);
  const after = decide({ now: at(700), state: helped, warning: null, devices: [o2] });
  assert.equal(after.status, "normal");
});

test("the countdown keeps running if the warning expires while the phone is still silent", () => {
  const inIncident: StateLike = { status: "countdown", outageInferredAt: at(-25), countdownZeroAt: at(215), lastHeartbeatAt: at(-25), activeAlertId: "w1", resolvedReason: null };
  const d = decide({ now: at(230), state: inIncident, warning: null, devices: [o2] });
  assert.equal(d.status, "countdown");
  assert.equal(d.fire, "h0");
});

test("ladder: who is contacted at each threshold", () => {
  const c = (id: string, priority: number, extra = {}) => ({ id, priority, channel: "sms" as const, isTownVolunteer: false, active: true, ...extra });
  const all = [c("a", 1), c("b", 2, { channel: "both" }), c("c", 3), c("v", 4, { isTownVolunteer: true }), c("x", 2, { active: false })];
  assert.deepEqual(recipientsFor("h6", all, true).map((x) => x.id), ["a"]);
  assert.deepEqual(recipientsFor("h2", all, true).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(recipientsFor("h0", all, true).map((x) => x.id), ["a", "b", "c", "v"]);
  assert.deepEqual(recipientsFor("h0", all, false).map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(channelsFor(all[1]), ["sms", "voice"]);
});

test("messages state the real time left and always mention 911", () => {
  assert.equal(formatRemaining(3.58 * 3_600_000), "about 3.5 hours");
  assert.equal(formatRemaining(60 * 60_000), "about 1 hour");
  assert.equal(formatRemaining(42 * 60_000), "about 40 minutes");
  const ctx = { label: "Mom's house", town: "Ossipee", address: "1 Main St", deviceLabel: "Portable O2", remainingMs: 2 * 3_600_000 };
  for (const t of ["h6", "h2", "h0"] as const) assert.match(thresholdSms(t, ctx, { volunteer: false }), /911/);
  assert.match(thresholdSms("h0", ctx, { volunteer: true }), /1 Main St.*CHECKED/);
  assert.match(voiceTwiml("Tom & <Jerry>", "https://x.test/v?alert=1&b=2"), /Tom &amp; &lt;Jerry&gt;.*alert=1&amp;b=2/);
});

test("replies: words and key presses", () => {
  assert.equal(parseReply(" ok "), "OK");
  assert.equal(parseReply("Help!"), "HELP");
  assert.equal(parseReply("checked"), "CHECKED");
  assert.equal(parseReply("stop"), "STOP");
  assert.equal(parseReply("what is this"), "OTHER");
  assert.equal(parseDigit("1"), "OK");
  assert.equal(parseDigit("2"), "HELP");
  assert.equal(parseDigit("9"), "OTHER");
  assert.equal(parseReply("OK 20"), "OK");
  assert.equal(parseReply("on my way, 15 min"), "OK");
  assert.equal(parseReply("here"), "CHECKED");
  assert.equal(parseEtaMinutes("OK 20"), 20);
  assert.equal(parseEtaMinutes("omw 1.5 hours"), 90);
  assert.equal(parseEtaMinutes("ok"), null);
  assert.equal(parseEtaMinutes("ok 0"), null);
});

test("phone numbers are E.164 or the save fails", () => {
  assert.equal(normalizePhone("(603) 555-0101"), "+16035550101");
  assert.equal(normalizePhone("1 603 555 0101"), "+16035550101");
  assert.equal(normalizePhone("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizePhone("555-0101"), null);
  assert.equal(normalizePhone("call me"), null);
});

test("Twilio webhook signatures are checked", () => {
  const params = { From: "+16035550101", Body: "OK" };
  const sig = expectedSignature("token", "https://x.test/api/twilio/inbound", params);
  assert.equal(validateSignature("token", sig, "https://x.test/api/twilio/inbound", params), true);
  assert.equal(validateSignature("token", sig, "https://x.test/api/twilio/inbound", { ...params, Body: "HELP" }), false);
  assert.equal(validateSignature("token", null, "https://x.test/api/twilio/inbound", params), false);
});

test("NWS alerts: the hazard's end time wins over the bulletin's expiry", () => {
  const row = alertRow({ properties: { id: "x", event: "Ice Storm Warning", onset: "2025-12-29T03:00:00Z", expires: "2025-12-29T08:00:00Z", ends: "2025-12-30T00:00:00Z", geocode: { UGC: ["NHZ006"] } } });
  assert.equal(row?.expires.toISOString(), "2025-12-30T00:00:00.000Z");
  assert.deepEqual(row?.zones, ["NHZ006"]);
  assert.equal(alertRow({ properties: { id: "x", event: "Ice Storm Warning" } }), null);
});
