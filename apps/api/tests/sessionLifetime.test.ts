import assert from "node:assert/strict";
import test from "node:test";
import { isLoginSessionActive, loginSessionExpiresAt } from "../src/utils/sessionLifetime";

test("calculates a login session expiry exactly 24 hours after sign-in", () => {
  const signedInAt = new Date("2026-08-05T01:29:00.000Z");

  assert.equal(loginSessionExpiresAt(signedInAt).toISOString(), "2026-08-06T01:29:00.000Z");
});

test("treats legacy 30-day sessions as expired after 24 hours", () => {
  const signedInAt = new Date("2026-08-03T01:29:00.000Z");
  const checkedAt = new Date("2026-08-05T03:00:00.000Z");

  assert.equal(isLoginSessionActive({ createdAt: signedInAt, revokedAt: null }, checkedAt), false);
});
