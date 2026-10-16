// AI-assisted: written with Claude Code from the team's build spec.
import assert from "node:assert/strict";
import { test } from "node:test";
import { guidanceFor, type GuidanceInput } from "../src/lib/guidance";
import { helpCascadeText, thresholdSms } from "../src/lib/messages";

const base: GuidanceInput = {
  residentName: "Mom",
  residentPhone: "+16035550100",
  address: "1 Main St, Ossipee",
  devices: [{ type: "o2_concentrator", label: "Concentrator" }],
  remainingMs: 3 * 3_600_000,
  helpRequested: false,
  tier: "stable",
  livesAlone: false,
  canLeaveUnassisted: true,
  accessNotes: "Side door, key in lockbox",
};

test("guidance starts with calling the resident and ends with when to call 911", () => {
  const steps = guidanceFor(base);
  assert.match(steps[0].title, /Call Mom/);
  assert.match(steps[0].detail, /\+16035550100/);
  assert.match(steps.at(-1)!.title, /911/);
  assert.ok(steps.at(-1)!.urgent);
});

test("guidance has one step per device kind and shows the entry notes", () => {
  const steps = guidanceFor({ ...base, devices: [{ type: "o2_concentrator", label: "A" }, { type: "o2_concentrator", label: "B" }, { type: "fridge_meds", label: "Insulin" }] });
  assert.equal(steps.filter((s) => /Oxygen/.test(s.title)).length, 1);
  assert.ok(steps.some((s) => /Cold medicine/.test(s.title)));
  assert.ok(steps.some((s) => s.detail === "Side door, key in lockbox"));
});

test("a HELP request leads, and a resident who can't leave is not moved alone", () => {
  const steps = guidanceFor({ ...base, helpRequested: true, canLeaveUnassisted: false, remainingMs: null });
  assert.match(steps[0].title, /Help was requested/);
  assert.ok(steps.some((s) => /may not be able to leave/.test(s.detail)));
});

test("no phone on file says so instead of inventing a number", () => {
  const steps = guidanceFor({ ...base, residentPhone: null });
  assert.match(steps[0].detail, /no phone on file/);
});

test("alert texts carry the responder link when there is one", () => {
  const ctx = { label: "Mom's house", town: "Ossipee", address: "1 Main St", deviceLabel: "Concentrator", remainingMs: 3_600_000 };
  assert.match(thresholdSms("h2", ctx, { volunteer: true, link: "https://x.test/r/abc" }), /What to do: https:\/\/x\.test\/r\/abc$/);
  assert.doesNotMatch(thresholdSms("h2", ctx, { volunteer: true }), /What to do/);
  assert.match(helpCascadeText("Dana", "Mom's house", "1 Main St", "https://x.test/r/abc"), /r\/abc$/);
});
