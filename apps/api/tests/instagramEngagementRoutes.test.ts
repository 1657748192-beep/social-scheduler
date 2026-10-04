import assert from "node:assert/strict";
import test from "node:test";

const ids = { workspace: "workspace-a", schedule: "schedule-a", account: "account-a" };
const publishedPost = {
  id: ids.schedule,
  workspaceId: ids.workspace,
  status: "published",
  postVariant: {
    platform: "instagram",
    socialAccount: {
      id: ids.account,
      workspaceId: ids.workspace,
      platform: "instagram",
      providerAccountId: "ig-123",
      status: "active",
      credential: { accessTokenEncrypted: "encrypted", scopes: [
        "instagram_business_basic",
        "instagram_business_content_publish",
        "instagram_business_manage_comments",
        "instagram_business_manage_messages"
      ] }
    }
  },
  publishJobs: [{ status: "succeeded", providerPostId: "ig-media-123", rawResponse: null }]
};

function setup(
  role: "owner" | "admin" | "editor" | "viewer" = "viewer",
  post: unknown = publishedPost,
  commentMediaId = "ig-media-123",
  conversationMessages: unknown[] = []
) {
  const calls: Array<{ method: string; args?: unknown }> = [];
  const claimedReplies = new Set<string>();
  const deps = {
    prisma: {
      schedule: { findFirst: async (args: unknown) => { calls.push({ method: "schedule.findFirst", args }); return post; } },
      socialAccount: { findFirst: async (args: unknown) => {
        calls.push({ method: "socialAccount.findFirst", args });
        return { ...publishedPost.postVariant.socialAccount, id: ids.account };
      } }
    },
    requireWorkspaceMembership: async () => ({ role }),
    now: () => new Date("2026-10-04T12:00:00Z"),
    createClient: () => ({
      getPostMetrics: async (mediaId: string) => { calls.push({ method: "metrics", args: mediaId }); return { likeCount: 4, commentCount: 2 }; },
      listComments: async (mediaId: string) => ({ items: [{ id: "comment-1", mediaId }], nextCursor: null }),
      getComment: async (commentId: string) => ({ id: commentId, mediaId: commentMediaId, timestamp: "2026-10-01T00:00:00Z" }),
      replyToComment: async (...args: unknown[]) => { calls.push({ method: "publicReply", args }); return { id: "reply-1" }; },
      sendPrivateReply: async (...args: unknown[]) => { calls.push({ method: "privateReply", args }); return { messageId: "message-1" }; },
      listConversations: async () => ({ items: [], nextCursor: null }),
      getConversation: async () => ({ id: "conversation-1", participantIds: ["ig-123", "user-123"] }),
      listMessages: async () => ({ items: conversationMessages, nextCursor: null }),
      sendMessage: async (...args: unknown[]) => { calls.push({ method: "sendMessage", args }); return { messageId: "message-2" }; }
    }),
    decryptToken: () => "access-token",
    privateReplyStore: {
      create: async (data: { commentId: string }) => {
        calls.push({ method: "claimPrivateReply" });
        if (claimedReplies.has(data.commentId)) throw { code: "P2002" };
        claimedReplies.add(data.commentId);
      },
      updatePending: async () => 1
    }
  };
  return { deps, calls };
}

test("interaction reads bind to a successful Instagram post owned by the requested workspace", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const { deps, calls } = setup();
  const service = createInstagramEngagementService(deps as never);

  assert.deepEqual(await service.getPostMetrics("viewer", ids.workspace, ids.schedule), {
    likeCount: 4,
    commentCount: 2
  });
  const lookup = calls.find((call) => call.method === "schedule.findFirst")?.args as { where: Record<string, unknown> };
  assert.deepEqual(lookup.where, { id: ids.schedule, workspaceId: ids.workspace, status: "published" });
  assert.deepEqual(calls.find((call) => call.method === "metrics")?.args, "ig-media-123");
});

test("rejects forged, cross-workspace, non-Instagram, and unsuccessful post references", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  for (const invalidPost of [
    { ...publishedPost, workspaceId: "workspace-other" },
    { ...publishedPost, postVariant: { ...publishedPost.postVariant, socialAccount: { ...publishedPost.postVariant.socialAccount, workspaceId: "workspace-other" } } },
    { ...publishedPost, postVariant: { ...publishedPost.postVariant, socialAccount: { ...publishedPost.postVariant.socialAccount, platform: "facebook" } } },
    { ...publishedPost, status: "failed" },
    { ...publishedPost, postVariant: { ...publishedPost.postVariant, platform: "facebook" } },
    { ...publishedPost, publishJobs: [{ status: "failed", providerPostId: "forged", rawResponse: null }] },
    { ...publishedPost, publishJobs: [{ status: "succeeded", providerPostId: null, rawResponse: null }] }
  ]) {
    const { deps } = setup("viewer", invalidPost);
    const service = createInstagramEngagementService(deps as never);
    await assert.rejects(service.getPostMetrics("viewer", ids.workspace, ids.schedule));
  }
});

test("viewers may read but cannot send replies; editors can send only a comment belonging to that post", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const viewer = setup("viewer");
  const viewerService = createInstagramEngagementService(viewer.deps as never);
  assert.equal((await viewerService.listComments("viewer", ids.workspace, ids.schedule)).items.length, 1);
  await assert.rejects(viewerService.replyToComment("viewer", ids.workspace, ids.schedule, "comment-1", "reply"));
  assert.equal(viewer.calls.some((call) => call.method === "publicReply"), false);

  const editor = setup("editor");
  const editorService = createInstagramEngagementService(editor.deps as never);
  await editorService.replyToComment("editor", ids.workspace, ids.schedule, "comment-1", "reply");
  assert.equal(editor.calls.some((call) => call.method === "publicReply"), true);

  const mismatched = setup("editor", publishedPost, "other-media");
  const mismatchedService = createInstagramEngagementService(mismatched.deps as never);
  await assert.rejects(mismatchedService.replyToComment("editor", ids.workspace, ids.schedule, "comment-1", "reply"));
  assert.equal(mismatched.calls.some((call) => call.method === "publicReply"), false);
});

test("missing interaction scopes disable those APIs without invalidating the existing publishing connection", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const postWithoutComments = {
    ...publishedPost,
    postVariant: {
      ...publishedPost.postVariant,
      socialAccount: {
        ...publishedPost.postVariant.socialAccount,
        credential: {
          ...publishedPost.postVariant.socialAccount.credential,
          scopes: ["instagram_business_basic", "instagram_business_content_publish"]
        }
      }
    }
  };
  const { deps } = setup("editor", postWithoutComments);
  const service = createInstagramEngagementService(deps as never);
  assert.deepEqual(await service.getPostMetrics("editor", ids.workspace, ids.schedule), {
    likeCount: 4,
    commentCount: 2
  });
  await assert.rejects(service.listComments("editor", ids.workspace, ids.schedule));
});

test("private replies are window-limited and exactly-once; inbox replies require a recent inbound message", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const { deps, calls } = setup("admin");
  const service = createInstagramEngagementService(deps as never);
  await service.sendPrivateReply("admin", ids.workspace, ids.schedule, "comment-1", "private");
  await assert.rejects(service.sendPrivateReply("admin", ids.workspace, ids.schedule, "comment-1", "duplicate"));
  assert.equal(calls.filter((call) => call.method === "privateReply").length, 1);

  const recentInbound = setup("editor", publishedPost, "ig-media-123", [
    { id: "message-in", message: "customer", created_time: "2026-10-04T11:45:00Z", from: { id: "user-123" } }
  ]);
  const inboxService = createInstagramEngagementService(recentInbound.deps as never);
  await inboxService.replyToConversation("editor", ids.workspace, ids.account, "conversation-1", "answer");
  assert.equal(recentInbound.calls.some((call) => call.method === "sendMessage"), true);

  const expiredInbound = setup("editor", publishedPost, "ig-media-123", [
    { id: "message-old", message: "customer", created_time: "2026-10-03T11:00:00Z", from: { id: "user-123" } }
  ]);
  const expiredService = createInstagramEngagementService(expiredInbound.deps as never);
  await assert.rejects(expiredService.replyToConversation("editor", ids.workspace, ids.account, "conversation-1", "answer"));
  assert.equal(expiredInbound.calls.some((call) => call.method === "sendMessage"), false);
});
