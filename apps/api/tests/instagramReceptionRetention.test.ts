import assert from "node:assert/strict";
import test from "node:test";
import { receptionRetentionCutoff, runReceptionCleanup } from "../src/services/instagramReceptionRetention";

test("reception retention is 90 days by default, configurable and rejects unsafe values", () => {
  const now = new Date("2026-10-06T00:00:00Z");
  assert.equal(receptionRetentionCutoff(undefined, now).toISOString(), "2026-07-08T00:00:00.000Z");
  assert.equal(receptionRetentionCutoff(1, now).toISOString(), "2026-10-05T00:00:00.000Z");
  for (const days of [0, -1, NaN, 1.5, 3651]) assert.throws(() => receptionRetentionCutoff(days, now));
});

test("daily reception cleanup caps work to ten batches of 500 records per content type", async () => {
  let calls = 0;
  await runReceptionCleanup({ cleanup: async (before, batch) => { assert.equal(batch, 500); assert.equal(before.toISOString(), "2026-07-08T00:00:00.000Z"); calls++; return { comments: 500, messages: 500 }; } }, 90, new Date("2026-10-06T00:00:00Z"));
  assert.equal(calls, 10);
});
