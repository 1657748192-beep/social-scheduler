import assert from "node:assert/strict";
import test from "node:test";
import { confirmAccountRemoval } from "../lib/confirmAccountRemoval";

test("cancelled account removal never performs the destructive action", async () => {
  let removed = false;
  const result = await confirmAccountRemoval("TikTok", "mooyamcosmetic", false, "zh", () => false, async () => { removed = true; });
  assert.equal(result, false);
  assert.equal(removed, false);
});

test("confirmation identifies the account before performing removal once", async () => {
  const events: string[] = [];
  await confirmAccountRemoval("YouTube", "mooyam", false, "zh", message => {
    assert.match(message, /YouTube/);
    assert.match(message, /mooyam/);
    assert.match(message, /解除绑定/);
    events.push("confirmed");
    return true;
  }, async () => { events.push("removed"); });
  assert.deepEqual(events, ["confirmed", "removed"]);
});

test("disconnected records use delete confirmation and propagate request failure", async () => {
  await assert.rejects(confirmAccountRemoval("Instagram", "test-user", true, "en", message => {
    assert.match(message, /Delete/);
    assert.match(message, /Instagram/);
    return true;
  }, async () => { throw new Error("request failed"); }), /request failed/);
});
