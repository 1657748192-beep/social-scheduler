import assert from "node:assert/strict";
import test from "node:test";
import { queryTikTokPostMetrics } from "../src/integrations/social/tiktokPostMetrics";
import { createTikTokPostMetricsService } from "../src/services/tiktokPostMetricsService";

const videoId = "7523456789012345678";
function post() {
  return {
    id: "schedule", workspaceId: "workspace", status: "published",
    postVariant: { platform: "tiktok", socialAccount: {
      id: "account", workspaceId: "workspace", platform: "tiktok", providerAccountId: "creator", status: "active",
      credential: { scopes: ["video.publish", "video.list"] }
    } },
    publishJobs: [{ status: "succeeded", providerPostId: videoId,
      rawResponse: { platform: "tiktok", tiktokAccountId: "creator", privacyLevel: "PUBLIC_TO_EVERYONE" } }]
  };
}

test("queries only the selected video, preserving 64-bit IDs and real zero counts", async () => {
  const result = await queryTikTokPostMetrics("secret", videoId, async (url, init) => {
    assert.equal(new URL(String(url)).pathname, "/v2/video/query/");
    assert.deepEqual(JSON.parse(String(init?.body)), { filters: { video_ids: [videoId] } });
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
    return Response.json({ error: { code: "ok" }, data: { videos: [{ id: videoId, view_count: 123, like_count: 0, comment_count: 3, share_count: 2 }] } });
  });
  assert.deepEqual(result, { status: "ok", viewCount: 123, likeCount: 0, commentCount: 3, shareCount: 2 });
});

test("empty, mismatched or incomplete API data never becomes zero statistics", async () => {
  for (const videos of [[], [{ id: "other" }], [{ id: videoId, view_count: 1 }]]) {
    const result = await queryTikTokPostMetrics("secret", videoId, async () => Response.json({ error: { code: "ok" }, data: { videos } }));
    assert.equal(result.status, "video_unavailable");
  }
});

test("provider errors and network failures are safe, distinct panel states", async () => {
  for (const [code, status, expected] of [["scope_not_authorized", 401, "permission_missing"], ["access_token_invalid", 401, "authorization_required"], ["rate_limit_exceeded", 429, "rate_limited"], ["internal_error", 500, "temporarily_unavailable"]] as const) {
    assert.deepEqual(await queryTikTokPostMetrics("secret", videoId, async () => Response.json({ error: { code, message: "secret" } }, { status })), { status: expected });
  }
  assert.deepEqual(await queryTikTokPostMetrics("secret", videoId, async () => { throw new Error("secret"); }), { status: "temporarily_unavailable" });
  assert.deepEqual(await queryTikTokPostMetrics("secret", videoId, async () => new Response("", { status: 429 })), { status: "rate_limited" });
  assert.deepEqual(await queryTikTokPostMetrics("secret", videoId, async () => new Response("<html>error</html>", { status: 401 })), { status: "authorization_required" });
});

test("missing optional data permission never touches token refresh or publishing status", async () => {
  const record = post();
  record.postVariant.socialAccount.credential.scopes = ["video.publish"];
  const service = createTikTokPostMetricsService({
    requireMembership: async () => {}, findPost: async () => record,
    getAccessToken: async () => { assert.fail("must not refresh a token for missing optional permissions"); },
    queryMetrics: async () => { assert.fail("must not query without permission"); }
  });
  assert.deepEqual(await service("user", "workspace", "schedule"), { status: "permission_missing" });
  assert.equal(record.postVariant.socialAccount.status, "active");
});

test("membership, workspace and account identity are checked before provider access", async () => {
  const record = post();
  let denied = true;
  const service = createTikTokPostMetricsService({
    requireMembership: async () => { if (denied) throw new Error("forbidden"); },
    findPost: async () => record,
    getAccessToken: async () => { assert.fail("must not access credentials"); },
    queryMetrics: async () => { assert.fail("must not query another tenant"); }
  });
  await assert.rejects(service("user", "workspace", "schedule"), /forbidden/);
  denied = false;
  await assert.rejects(service("user", "other", "schedule"), /not found/i);
  record.postVariant.socialAccount.providerAccountId = "different";
  assert.deepEqual(await service("user", "workspace", "schedule"), { status: "account_unavailable" });
});

test("private videos, task IDs and simulated publishes are not queried", async () => {
  const record = post();
  const service = createTikTokPostMetricsService({
    requireMembership: async () => {}, findPost: async () => record,
    getAccessToken: async () => { assert.fail("no usable public video"); },
    queryMetrics: async () => { assert.fail("no usable public video"); }
  });
  record.publishJobs[0].rawResponse.privacyLevel = "SELF_ONLY";
  assert.deepEqual(await service("user", "workspace", "schedule"), { status: "private_video" });
  record.publishJobs[0].rawResponse.privacyLevel = "PUBLIC_TO_EVERYONE";
  record.publishJobs[0].providerPostId = "v_pub_url~task";
  assert.deepEqual(await service("user", "workspace", "schedule"), { status: "video_id_missing" });
  record.publishJobs[0].providerPostId = videoId;
  Object.assign(record.publishJobs[0].rawResponse, { simulated: true });
  await assert.rejects(service("user", "workspace", "schedule"), /not found/i);
});

test("authorized published posts return metrics and the actual fetch timestamp", async () => {
  const service = createTikTokPostMetricsService({
    requireMembership: async () => {}, findPost: async (workspace, schedule) => {
      assert.equal(workspace, "workspace"); assert.equal(schedule, "schedule"); return post();
    },
    getAccessToken: async (account) => { assert.equal(account, "account"); return "token"; },
    queryMetrics: async (token, id) => {
      assert.equal(token, "token"); assert.equal(id, videoId);
      return { status: "ok", viewCount: 10, likeCount: 2, commentCount: 1, shareCount: 0 };
    }, now: () => new Date("2026-10-06T00:00:00Z")
  });
  assert.deepEqual(await service("user", "workspace", "schedule"), {
    status: "ok", viewCount: 10, likeCount: 2, commentCount: 1, shareCount: 0, fetchedAt: "2026-10-06T00:00:00.000Z"
  });
});

test("temporary credential failures do not tell users to reauthorize", async () => {
  const service = createTikTokPostMetricsService({
    requireMembership: async () => {}, findPost: async () => post(),
    getAccessToken: async () => { throw new Error("TikTok token refresh could not reach TikTok."); },
    queryMetrics: async () => { assert.fail("no token was obtained"); }
  });
  assert.deepEqual(await service("user", "workspace", "schedule"), { status: "temporarily_unavailable" });
});

test("a scope error from TikTok stays local to data and preserves publishing status", async () => {
  const record = post();
  const service = createTikTokPostMetricsService({
    requireMembership: async () => {}, findPost: async () => record,
    getAccessToken: async () => "token",
    queryMetrics: async () => ({ status: "permission_missing" })
  });
  assert.deepEqual(await service("user", "workspace", "schedule"), { status: "permission_missing" });
  assert.equal(record.postVariant.socialAccount.status, "active");
  assert.deepEqual(record.postVariant.socialAccount.credential.scopes, ["video.publish", "video.list"]);
});
