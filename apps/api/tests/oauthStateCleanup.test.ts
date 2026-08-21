import assert from "node:assert/strict";
import test from "node:test";
import { removeOAuthStateIfPresent } from "../src/services/oauthStateCleanup";

test("does not fail when a concurrent OAuth callback already consumed the state", async () => {
  const deleted = await removeOAuthStateIfPresent(
    {
      async deleteMany() {
        return { count: 0 };
      }
    },
    "already-consumed-state"
  );

  assert.equal(deleted, false);
});

test("reports deletion when this callback consumes the OAuth state", async () => {
  const deleted = await removeOAuthStateIfPresent(
    {
      async deleteMany() {
        return { count: 1 };
      }
    },
    "active-state"
  );

  assert.equal(deleted, true);
});
