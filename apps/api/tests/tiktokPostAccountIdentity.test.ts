import assert from "node:assert/strict";
import test from "node:test";
import { resolveTikTokPostAccount } from "../src/services/tiktokPostAccountIdentity";

const account = { id: "rebound-row", workspaceId: "workspace", platform: "tiktok", providerAccountId: "original-open-id", status: "active", displayName: "mooyamcosmetic" };
const saved = { platform: "tiktok", tiktokAccountId: "original-open-id" };

test("restored account supplies its current name without depending on the removed row ID", async () => {
  const restored = await resolveTikTokPostAccount("workspace", null, { ...saved, socialAccountId: "deleted-row", creatorUsername: "old-name" }, async (workspace, identity) => {
    assert.equal(workspace, "workspace"); assert.equal(identity, "original-open-id"); return account;
  });
  assert.equal(restored?.displayName, "mooyamcosmetic");
  assert.equal(restored?.id, "rebound-row");
});

test("existing exact links keep their metadata without a recovery lookup", async () => {
  assert.equal(await resolveTikTokPostAccount("workspace", account, saved, async () => { assert.fail("already linked"); }), account);
});

test("invalid linked identity cannot silently fall back to a different record", async () => {
  for (const change of [{ providerAccountId: "other" }, { workspaceId: "other" }, { platform: "instagram" }, { status: "disconnected" }]) {
    assert.equal(await resolveTikTokPostAccount("workspace", { ...account, ...change }, saved, async () => { assert.fail("invalid existing link"); }), null);
  }
});

test("missing malformed and simulated saved identities never guess by username", async () => {
  for (const raw of [null, [], { ...saved, tiktokAccountId: null }, { ...saved, tiktokAccountId: " original-open-id " },
    { ...saved, simulated: true }, { platform: "tiktok", creatorUsername: "mooyamcosmetic" }]) {
    assert.equal(await resolveTikTokPostAccount("workspace", null, raw, async () => { assert.fail("unverified recovery"); }), null);
  }
  assert.equal(await resolveTikTokPostAccount("workspace", null, saved, async () => null), null);
});
