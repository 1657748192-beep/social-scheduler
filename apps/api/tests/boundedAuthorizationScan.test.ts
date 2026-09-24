import assert from "node:assert/strict";
import test from "node:test";
import { nextAuthorizationScanBatch } from "../src/integrations/social/boundedAuthorizationScan";

test("the scan cursor reaches accounts beyond the first 100", async () => {
  const ids = Array.from({ length: 150 }, (_, index) => String(index + 1).padStart(3, "0"));
  let cursor: string | null = null;
  const input = {
    readCursor: async () => cursor,
    writeCursor: async (value: string | null) => { cursor = value; },
    select: async (afterId: string | null, limit: number) => ids.filter((id) => !afterId || id > afterId).slice(0, limit)
  };
  assert.equal((await nextAuthorizationScanBatch(input)).length, 100);
  const second = await nextAuthorizationScanBatch(input);
  assert.equal(second.length, 50);
  assert.equal(second[0], "101");
  assert.equal((await nextAuthorizationScanBatch(input))[0], "001");
});

test("the scan wraps when the prior cursor is past every currently due account", async () => {
  let cursor: string | null = "900";
  const batch = await nextAuthorizationScanBatch({
    readCursor: async () => cursor,
    writeCursor: async (value) => { cursor = value; },
    select: async (afterId) => afterId ? [] : ["005"]
  });
  assert.deepEqual(batch, ["005"]);
  assert.equal(cursor, "005");
});

test("a provider can lower its batch cap to fit inside the scan lease", async () => {
  let selectedLimit = 0;
  await nextAuthorizationScanBatch({
    readCursor: async () => null,
    writeCursor: async () => {},
    select: async (_afterId, limit) => { selectedLimit = limit; return []; },
    limit: 80
  });
  assert.equal(selectedLimit, 80);
});
