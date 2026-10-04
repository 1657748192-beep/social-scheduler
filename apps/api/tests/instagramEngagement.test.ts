import assert from "node:assert/strict";
import test from "node:test";
import {
  canSendInstagramPrivateReply,
  createInstagramEngagementClient,
  InstagramEngagementApiError,
  classifyInstagramEngagementFailure,
  isInstagramMessagingWindowOpen
} from "../src/integrations/social/instagramEngagement";

function response(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

test("reads post metrics and paginated comments using the Instagram Login API", async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const client = createInstagramEngagementClient({
    accessToken: "secret-token",
    instagramAccountId: "ig-account",
    apiVersion: "v26.0",
    fetcher: async (input, init) => {
      calls.push({ url: new URL(String(input)), init });
      return calls.length === 1
        ? response({ id: "media-1", like_count: 12, comments_count: 2 })
        : response({ data: [{ id: "comment-1", text: "hello", timestamp: "2026-10-01T00:00:00+0000" }], paging: { cursors: { after: "next-cursor" } } });
    }
  });

  assert.deepEqual(await client.getPostMetrics("media-1"), { likeCount: 12, commentCount: 2 });
  assert.deepEqual(await client.listComments("media-1", { after: "previous-cursor", limit: 20 }), {
    items: [{ id: "comment-1", text: "hello", timestamp: "2026-10-01T00:00:00+0000" }],
    nextCursor: "next-cursor"
  });
  assert.equal(calls[0].url.hostname, "graph.instagram.com");
  assert.equal(calls[0].url.pathname, "/v26.0/media-1");
  assert.equal(calls[0].url.searchParams.get("fields"), "like_count,comments_count");
  assert.equal(calls[1].url.pathname, "/v26.0/media-1/comments");
  assert.equal(calls[1].url.searchParams.get("after"), "previous-cursor");
  assert.equal(calls[0].url.searchParams.has("access_token"), false);
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), "Bearer secret-token");
});

test("sends public comment replies as form data and private replies or DMs as explicit message payloads", async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const client = createInstagramEngagementClient({
    accessToken: "secret-token",
    instagramAccountId: "ig-account",
    apiVersion: "v26.0",
    fetcher: async (input, init) => {
      calls.push({ url: new URL(String(input)), init });
      return response({ id: `reply-${calls.length}`, message_id: `message-${calls.length}` });
    }
  });

  await client.replyToComment("comment-1", "public answer");
  await client.sendPrivateReply("comment-2", "private answer");
  await client.sendMessage("instagram-scoped-user", "reply to inbound DM");

  assert.equal(calls[0].url.pathname, "/v26.0/comment-1/replies");
  assert.equal(calls[0].url.searchParams.has("message"), false);
  assert.equal(String(calls[0].init?.body), "message=public+answer");
  assert.equal(calls[1].url.pathname, "/v26.0/ig-account/messages");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    recipient: { comment_id: "comment-2" }, message: { text: "private answer" }
  });
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), {
    recipient: { id: "instagram-scoped-user" }, message: { text: "reply to inbound DM" }
  });
});

test("fetches comment ownership and conversation participants from Meta before accepting caller-supplied IDs", async () => {
  const calls: URL[] = [];
  const client = createInstagramEngagementClient({
    accessToken: "secret-token",
    instagramAccountId: "ig-account",
    apiVersion: "v26.0",
    fetcher: async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      return calls.length === 1
        ? response({ id: "comment-1", media: { id: "media-1" }, timestamp: "2026-10-01T00:00:00Z" })
        : response({ id: "conversation-1", participants: { data: [{ id: "ig-account" }, { id: "user-1" }] } });
    }
  });

  assert.deepEqual(await client.getComment("comment-1"), {
    id: "comment-1", mediaId: "media-1", timestamp: "2026-10-01T00:00:00Z"
  });
  assert.deepEqual(await client.getConversation("conversation-1"), {
    id: "conversation-1", participantIds: ["ig-account", "user-1"]
  });
  assert.equal(calls[0].pathname, "/v26.0/comment-1");
  assert.equal(calls[0].searchParams.get("fields"), "id,media,timestamp");
  assert.equal(calls[1].pathname, "/v26.0/conversation-1");
  assert.equal(calls[1].searchParams.get("fields"), "id,participants");
});

test("reads conversations and messages without persisting or rewriting Meta payload text", async () => {
  const calls: URL[] = [];
  const client = createInstagramEngagementClient({
    accessToken: "secret-token",
    instagramAccountId: "ig-account",
    apiVersion: "v26.0",
    fetcher: async (input) => {
      calls.push(new URL(String(input)));
      return calls.length === 1
        ? response({ data: [{ id: "conversation-1", updated_time: "2026-10-01T00:00:00+0000" }], paging: { cursors: { after: "c-next" } } })
        : response({ data: [{ id: "message-1", message: "customer text", created_time: "2026-10-01T00:00:00+0000" }] });
    }
  });

  assert.deepEqual(await client.listConversations({ after: "c-prev" }), {
    items: [{ id: "conversation-1", updated_time: "2026-10-01T00:00:00+0000" }],
    nextCursor: "c-next"
  });
  assert.deepEqual(await client.listMessages("conversation-1", { limit: 10 }), {
    items: [{ id: "message-1", message: "customer text", created_time: "2026-10-01T00:00:00+0000" }],
    nextCursor: null
  });
  assert.equal(calls[0].pathname, "/v26.0/ig-account/conversations");
  assert.equal(calls[0].searchParams.get("platform"), "instagram");
  assert.equal(calls[1].pathname, "/v26.0/conversation-1");
});

test("classifies Meta permission, authorization, private reply window, throttling and server failures", () => {
  assert.equal(classifyInstagramEngagementFailure(403, { code: 200 }), "permission_missing");
  assert.equal(classifyInstagramEngagementFailure(401, { code: 190 }), "authorization_invalid");
  assert.equal(classifyInstagramEngagementFailure(400, { code: 10, message: "Private reply window expired" }), "window_expired");
  assert.equal(classifyInstagramEngagementFailure(429, {}), "rate_limited");
  assert.equal(classifyInstagramEngagementFailure(503, {}), "temporary_failure");
  assert.equal(classifyInstagramEngagementFailure(400, { code: 100 }), "request_failed");
});

test("enforces one-week private reply and 24-hour inbound messaging windows", () => {
  const now = new Date("2026-10-04T00:00:00.000Z");
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const justOverSevenDaysAgo = new Date(sevenDaysAgo.getTime() - 1);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const justOverOneDayAgo = new Date(oneDayAgo.getTime() - 1);

  assert.equal(canSendInstagramPrivateReply({ commentCreatedAt: sevenDaysAgo, now }), true);
  assert.equal(canSendInstagramPrivateReply({ commentCreatedAt: justOverSevenDaysAgo, now }), false);
  assert.equal(canSendInstagramPrivateReply({ commentCreatedAt: sevenDaysAgo, isLiveComment: true, liveIsActive: false, now }), false);
  assert.equal(canSendInstagramPrivateReply({ commentCreatedAt: sevenDaysAgo, isLiveComment: true, liveIsActive: true, now }), true);
  assert.equal(isInstagramMessagingWindowOpen(oneDayAgo, now), true);
  assert.equal(isInstagramMessagingWindowOpen(justOverOneDayAgo, now), false);
});

test("sanitizes malformed and failed responses so token and provider text are not leaked", async () => {
  const token = "secret-token";
  const client = createInstagramEngagementClient({
    accessToken: token,
    instagramAccountId: "ig-account",
    apiVersion: "v26.0",
    fetcher: async () => response({ error: { message: `bad request for ${token}`, code: 200 } }, 403)
  });

  await assert.rejects(client.getPostMetrics("media-1"), (error: unknown) => {
    assert.ok(error instanceof InstagramEngagementApiError);
    assert.equal(error.kind, "permission_missing");
    assert.equal(error.message.includes(token), false);
    assert.equal(error.message.includes("bad request"), false);
    return true;
  });

  const networkFailureClient = createInstagramEngagementClient({
    accessToken: token,
    instagramAccountId: "ig-account",
    apiVersion: "v26.0",
    fetcher: async () => { throw new Error(`network ${token}`); }
  });
  await assert.rejects(networkFailureClient.getPostMetrics("media-1"), (error: unknown) => {
    assert.ok(error instanceof InstagramEngagementApiError);
    assert.equal(error.kind, "temporary_failure");
    assert.equal(error.message.includes(token), false);
    return true;
  });
});
