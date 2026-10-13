// AI-assisted: written with Claude Code from the team's build spec.
// Login helpers that need no database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccess, normalizeEmail } from "../src/lib/auth";

test("emails are trimmed, lowercased and checked", () => {
  assert.equal(normalizeEmail("  Dana@Example.com "), "dana@example.com");
  assert.equal(normalizeEmail("not an email"), null);
  assert.equal(normalizeEmail(42), null);
});

test("an unowned household is open by link; an owned one is its owner's or the admin's", () => {
  const me = { id: "u1", email: "me@example.com" };
  const other = { id: "u2", email: "other@example.com" };
  assert.equal(canAccess({ ownerUserId: null }, null), true);
  assert.equal(canAccess({ ownerUserId: "u1" }, me), true);
  assert.equal(canAccess({ ownerUserId: "u1" }, other), false);
  assert.equal(canAccess({ ownerUserId: "u1" }, null), false);
  assert.equal(canAccess({ ownerUserId: "u1" }, null, true), true);
});
