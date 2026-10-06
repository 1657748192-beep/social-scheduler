import assert from "node:assert/strict";
import test from "node:test";
import { queryTikTokAccountStats } from "../src/integrations/social/tiktokAccountStats";
import { createTikTokAccountStatsService } from "../src/services/tiktokAccountStatsService";

test("reads only account statistics, preserving zeros and checking account identity", async () => {
  const result = await queryTikTokAccountStats("token", "creator", async (url, init) => {
    assert.equal(new URL(String(url)).pathname, "/v2/user/info/");
    assert.equal(new URL(String(url)).searchParams.get("fields"), "open_id,follower_count,following_count,likes_count,video_count");
    assert.equal(init?.method, "GET");
    return Response.json({ error: { code: "ok" }, data: { user: { open_id: "creator", follower_count: 12, following_count: 0, likes_count: 123, video_count: 4 } } });
  });
  assert.deepEqual(result, { status: "ok", followerCount: 12, followingCount: 0, likesCount: 123, videoCount: 4 });
  for (const user of [{ open_id: "other", follower_count: 1, following_count: 1, likes_count: 1, video_count: 1 }, { open_id: "creator" }, null]) {
    assert.deepEqual(await queryTikTokAccountStats("token", "creator", async () => Response.json({ error: { code: "ok" }, data: { user } })), { status: "data_unavailable" });
  }
});

test("upstream permission, throttling and network failures remain safe panel states", async () => {
  for (const [response, expected] of [
    [Response.json({ error: { code: "scope_not_authorized", message: "secret" } }, { status: 401 }), "permission_missing"],
    [new Response("", { status: 429 }), "rate_limited"],
    [new Response("", { status: 401 }), "authorization_required"],
    [new Response("", { status: 503 }), "temporarily_unavailable"]
  ] as const) assert.deepEqual(await queryTikTokAccountStats("token", "creator", async () => response), { status: expected });
  assert.deepEqual(await queryTikTokAccountStats("token", "creator", async () => { throw new Error("secret"); }), { status: "temporarily_unavailable" });
});

test("membership, tenant identity and optional stats scope are enforced before token access", async () => {
  const account = { id: "account", workspaceId: "workspace", platform: "tiktok", providerAccountId: "creator", status: "active", credential: { scopes: ["video.publish", "video.list"] } };
  let deny = true;
  const service = createTikTokAccountStatsService({
    requireMembership: async () => { if (deny) throw new Error("forbidden"); }, findAccount: async () => account,
    getAccessToken: async () => { assert.fail("must not touch publishing credentials"); },
    queryStats: async () => { assert.fail("must not query without scope"); }
  });
  await assert.rejects(service("user", "workspace", "account"), /forbidden/);
  deny = false;
  await assert.rejects(service("user", "other", "account"), /not found/i);
  await assert.rejects(service("user", "workspace", "other"), /not found/i);
  assert.deepEqual(await service("user", "workspace", "account"), { status: "permission_missing" });
  assert.equal(account.status, "active");
});

test("stats authorization works without video.list and records fetch time", async () => {
  const service = createTikTokAccountStatsService({
    requireMembership: async () => {}, findAccount: async () => ({ id: "a", workspaceId: "w", platform: "tiktok", providerAccountId: "creator", status: "active", credential: { scopes: ["user.info.stats"] } }),
    getAccessToken: async id => { assert.equal(id, "a"); return "token"; },
    queryStats: async (token, creator) => { assert.equal(token, "token"); assert.equal(creator, "creator"); return { status: "ok", followerCount: 12, followingCount: 0, likesCount: 123, videoCount: 4 }; },
    now: () => new Date("2026-10-06T00:00:00Z")
  });
  assert.deepEqual(await service("u", "w", "a"), { status: "ok", followerCount: 12, followingCount: 0, likesCount: 123, videoCount: 4, fetchedAt: "2026-10-06T00:00:00.000Z" });
});
