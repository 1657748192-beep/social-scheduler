import assert from "node:assert/strict";
import test from "node:test";
import type { SocialAccount } from "../lib/api";
import { authorizationWarning } from "../lib/authorizationWarning";

const now = Date.parse("2026-09-24T00:00:00.000Z");
const accountWithDeadline = (days: number) => ({
  status: "active",
  credential: { refreshTokenExpiresAt: new Date(now + days * 86400000).toISOString() }
}) as SocialAccount;

test("warns at 30 and 7 days before a known renewal deadline", () => {
  assert.equal(authorizationWarning(accountWithDeadline(31), now), null);
  assert.equal(authorizationWarning(accountWithDeadline(30), now), "soon");
  assert.equal(authorizationWarning(accountWithDeadline(7), now), "urgent");
  assert.equal(authorizationWarning(accountWithDeadline(-1), now), "expired");
});

test("does not invent a deadline or obscure a nonactive primary status", () => {
  assert.equal(authorizationWarning({ status: "active", credential: { refreshTokenExpiresAt: null } } as SocialAccount, now), null);
  assert.equal(authorizationWarning({ status: "active", credential: { refreshTokenExpiresAt: "not-a-date" } } as SocialAccount, now), null);
  assert.equal(authorizationWarning({ ...accountWithDeadline(-1), status: "authorization_invalid" }, now), null);
});
