import assert from "node:assert/strict";
import test from "node:test";
import { isLinkedMediaReadyForCleanup } from "../src/services/mediaCleanupPolicy";

const now = Date.parse("2026-08-21T10:00:00.000Z");

test("preserves media linked to a Pinterest Pin that is still scheduled", () => {
  assert.equal(
    isLinkedMediaReadyForCleanup(
      {
        variantLinks: [
          {
            postVariant: {
              publishStatus: "queued",
              schedules: [{ status: "scheduled", updatedAt: new Date(now - 7 * 24 * 60 * 60 * 1000) }]
            }
          }
        ]
      },
      now,
      24 * 60 * 60 * 1000,
      72 * 60 * 60 * 1000
    ),
    false
  );
});

test("cleans only terminal linked media after the appropriate retention period", () => {
  assert.equal(
    isLinkedMediaReadyForCleanup(
      {
        variantLinks: [
          {
            postVariant: {
              publishStatus: "published",
              schedules: [{ status: "published", updatedAt: new Date(now - 25 * 60 * 60 * 1000) }]
            }
          }
        ]
      },
      now,
      24 * 60 * 60 * 1000,
      72 * 60 * 60 * 1000
    ),
    true
  );
  assert.equal(
    isLinkedMediaReadyForCleanup(
      {
        variantLinks: [
          {
            postVariant: {
              publishStatus: "failed",
              schedules: [{ status: "failed", updatedAt: new Date(now - 24 * 60 * 60 * 1000) }]
            }
          }
        ]
      },
      now,
      24 * 60 * 60 * 1000,
      72 * 60 * 60 * 1000
    ),
    false
  );
});
