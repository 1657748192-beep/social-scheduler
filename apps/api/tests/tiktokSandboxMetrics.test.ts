import assert from "node:assert/strict";
import test from "node:test";
import { sandboxVideoId, createSandboxMetricsService } from "../src/services/tiktokSandboxMetricsService";
import { encryptToken } from "../src/utils/tokenCrypto";
const post = { id: "p", workspaceId: "w", status: "published", postVariant: { platform: "tiktok", socialAccountId: "a" },
  publishJobs: [{ status: "succeeded", providerPostId: "123456789012345", rawResponse: { tiktokAccountId: "prod", privacyLevel: "PUBLIC_TO_EVERYONE" } }] };
test("only the specified account's real public published post is accepted", () => {
  assert.equal(sandboxVideoId(post, "w", "a", "prod"), "123456789012345");
  for (const bad of [null, { ...post, workspaceId: "other" }, { ...post, status: "failed" }, { ...post, postVariant: { platform: "tiktok", socialAccountId: "other" } },
    { ...post, publishJobs: [{ ...post.publishJobs[0], providerPostId: "publish-task-id" }] },
    ...[{ simulated: true }, { tiktokAccountId: "other" }, { privacyLevel: "SELF_ONLY" }].map(rawResponse => ({ ...post, publishJobs: [{ ...post.publishJobs[0], rawResponse }] }))]) {
    assert.throws(() => sandboxVideoId(bad, "w", "a", "prod"));
  }
});

test("published task IDs stay visible and resolve exactly before querying sandbox metrics", async () => {
  const scheduleId = "11111111-1111-4111-8111-111111111111";
  const pending = { ...post, id: scheduleId, postVariant: { ...post.postVariant, text: "Published video" },
    publishJobs: [{ ...post.publishJobs[0], providerPostId: "v_pub_url~v2-1.123", rawResponse: { ...post.publishJobs[0].rawResponse, publishId: "v_pub_url~v2-1.123" } }] };
  const settings = { enabled: true, allowedUserId: "u", allowedWorkspaceId: "w", allowedAccountId: "a", clientId: "sandbox", clientSecret: "secret", redirectUri: "https://example.test/callback" };
  const account = { id: "a", providerAccountId: "prod", credential: { accessTokenEncrypted: encryptToken("production"), expiresAt: new Date(Date.now() + 3600000), scopes: ["video.publish"] } };
  const db: any = { workspaceMember: { findUnique: async () => ({ status: "active", role: "owner" }) }, socialAccount: { findFirst: async () => account },
    schedule: { findMany: async () => [pending], findFirst: async () => pending }, $executeRaw: async () => {},
    tikTokSandboxCredential: { findUnique: async () => ({ userId: "u", workspaceId: "w", clientKey: "sandbox", scopes: ["user.info.basic", "video.list", "user.info.stats"], expiresAt: new Date(Date.now() + 3600000), accessTokenEncrypted: encryptToken("sandbox"), openId: "sandbox-open" }) } };
  db.$transaction = async (fn: any) => fn(db);
  const calls: string[] = [];
  let upstream = '{"error":{"code":"ok"},"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7693425265720494094]}}';
  const fetcher: typeof fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("status/fetch")) {
      assert.equal((init?.headers as any).Authorization, "Bearer production");
      assert.deepEqual(JSON.parse(String(init?.body)), { publish_id: "v_pub_url~v2-1.123" });
      return new Response(upstream);
    }
    assert.equal((init?.headers as any).Authorization, "Bearer sandbox");
    assert.deepEqual(JSON.parse(String(init?.body)), { filters: { video_ids: ["7693425265720494094"] } });
    return Response.json({ error: { code: "ok" }, data: { videos: [{ id: "7693425265720494094", view_count: 5, like_count: 2, comment_count: 1, share_count: 0 }] } });
  };
  const service = createSandboxMetricsService({ db, settings, api: {} as any }, fetcher);
  const list = await service.posts("u", "w");
  assert.equal(list.items.length, 1, "must not silently hide a published task");
  assert.equal(list.items[0].id, scheduleId);
  assert.equal(calls.length, 0, "listing must not automatically call TikTok");
  assert.equal((await service.metrics("u", "w", scheduleId)).status, "ok");
  assert.equal(calls.length, 2);
  for (const value of ['{"error":{"code":"ok"},"data":{"status":"PUBLISH_COMPLETE"}}', '{"error":{"code":"ok"},"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":["123456789012345","223456789012345"]}}']) {
    upstream = value; calls.length = 0;
    assert.equal((await service.metrics("u", "w", scheduleId)).status, "video_id_missing");
    assert.equal(calls.length, 1, "never guess a video or query with a task ID");
  }
  account.credential.expiresAt = new Date(0); calls.length = 0;
  assert.equal((await service.metrics("u", "w", scheduleId)).status, "authorization_required");
  assert.equal(calls.length, 0);
});
