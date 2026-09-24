import assert from "node:assert/strict";
import test from "node:test";
import { expiryFromSeconds, refreshDeadline } from "../src/integrations/social/oauthExpiry";

test("converts only finite positive durations into deadlines", () => {
  assert.equal(expiryFromSeconds(3600, 0)?.toISOString(), "1970-01-01T01:00:00.000Z");
  for (const value of [undefined, 0, -1, "3600", Number.NaN, Number.POSITIVE_INFINITY, 1e20]) {
    assert.equal(expiryFromSeconds(value, 0), null);
  }
});

test("uses each provider's own refresh expiry field", () => {
  assert.equal(refreshDeadline("tiktok", { refresh_expires_in: 31536000 }, 0)?.toISOString(), "1971-01-01T00:00:00.000Z");
  assert.equal(refreshDeadline("youtube", { refresh_token_expires_in: 604800 }, 0)?.getTime(), 604800000);
  assert.equal(refreshDeadline("facebook", { refresh_expires_in: 3600 }, 0), null);
  assert.equal(refreshDeadline("tiktok", { refresh_token_expires_in: 3600 }, 0), null);
});
