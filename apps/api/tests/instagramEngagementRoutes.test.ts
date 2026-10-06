import assert from "node:assert/strict";
import test from "node:test";

const ids = { workspace: "workspace-a", schedule: "schedule-a", account: "account-a" };
const publishedPost = {
  id: ids.schedule,
  workspaceId: ids.workspace,
  status: "published",
  postVariant: {
    id: "variant-a",
    platform: "instagram",
    instagramProviderAccountId: "ig-123",
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
  conversationMessages: unknown[] = [],
  selectedAccount: unknown = publishedPost.postVariant.socialAccount,
  ownershipVerified = true,
  updateCount = 1
) {
  const calls: Array<{ method: string; args?: unknown }> = [];
  const claimedReplies = new Set<string>();
  const deps = {
    prisma: {
      schedule: { findFirst: async (args: unknown) => { calls.push({ method: "schedule.findFirst", args }); return post; } },
      postVariant: { updateMany: async (args: unknown) => { calls.push({ method: "postVariant.updateMany", args }); return { count: updateCount }; } },
      socialAccount: { findFirst: async (args: unknown) => {
        calls.push({ method: "socialAccount.findFirst", args });
        return selectedAccount;
      } }
    },
    requireWorkspaceMembership: async () => ({ role }),
    now: () => new Date("2026-10-04T12:00:00Z"),
    createClient: () => ({
      ownsMedia: async (mediaId: string) => { calls.push({ method: "ownsMedia", args: mediaId }); return ownershipVerified; },
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

test("empty live comments retain received data with explicit source and provider state", async () => {
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const { deps } = setup();
  const client = deps.createClient();
  client.listComments = async () => ({ items: [], nextCursor: null });
  const received = { id: "received-comment", text: "hello", timestamp: "2026-10-04T10:00:00Z" };
  const service = createInstagramEngagementService({ ...deps, createClient: () => client,
    receptionStore: { listComments: async (account: string, media: string) => {
      assert.equal(account, ids.account); assert.equal(media, "ig-media-123");
      return { items: [received], nextCursor: null };
    }, getStatus: async () => ({ revision: "1", lastReceivedAt: "2026-10-04T10:00:00Z" }) }
  } as never);
  const result = await service.listComments("viewer", ids.workspace, ids.schedule);
  assert.equal(result.items[0].id, received.id);
  assert.equal((result as any).source, "received");
  assert.equal((result as any).providerReadStatus, "empty");
});

test("received inbox remains readable when Meta errors and denies foreign local thread IDs", async () => {
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const { deps } = setup();
  const client = deps.createClient();
  client.listConversations = async () => { throw { kind: "temporary_failure" }; };
  const service = createInstagramEngagementService({ ...deps, createClient: () => client,
    receptionStore: { listThreads: async () => ({ items: [{ id: "local:thread", participants: { data: [{ id: "customer" }] } }], nextCursor: null }),
      getThread: async () => null, getStatus: async () => ({ revision: "2", lastReceivedAt: null }) }
  } as never);
  const result = await service.listConversations("viewer", ids.workspace, ids.account);
  assert.equal(result.items[0].id, "local:thread");
  assert.equal((result as any).providerReadStatus, "error");
  await assert.rejects(service.listMessages("viewer", ids.workspace, ids.account, "local:foreign"), /not found/);
});

test("mixed pagination retains local remainder after the provider page ends", async () => {
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const { deps } = setup(); const api = deps.createClient();
  api.listComments = async (_media, options: any) => ({ items: [{ id: options?.after ? "live2" : "live1" }], nextCursor: options?.after ? null : "live-next" });
  const service = createInstagramEngagementService({ ...deps, createClient: () => api, receptionStore: {
    listComments: async (_a: string, _m: string, after?: string) => ({ items: [{ id: after ? "local2" : "local1" }], nextCursor: after ? null : "local-next" }),
    getStatus: async () => ({ revision: "1", lastReceivedAt: null })
  } } as never);
  const first = await service.listComments("viewer", ids.workspace, ids.schedule);
  const second = await service.listComments("viewer", ids.workspace, ids.schedule, { after: first.nextCursor! });
  assert.deepEqual(new Set([...first.items, ...second.items].map(i => i.id)), new Set(["live1", "live2", "local1", "local2"]));
});

test("subscription status expires from the last actual verification, not every poll", async () => {
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const { deps } = setup(); const api = deps.createClient(); let reads = 0;
  (api as any).getSubscribedFields = async () => { reads++; return reads === 1 ? ["messages"] : ["messages", "comments"]; };
  const service = createInstagramEngagementService({ ...deps, createClient: () => api } as never);
  const original = Date.now; let now = 0; Date.now = () => now;
  try {
    for (now = 0; now < 150000; now += 15000) await service.getReceptionStatus("viewer", ids.workspace, ids.account);
    assert.ok(reads >= 3);
  } finally { Date.now = original; }
});

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

test("recovers a legacy orphan only after the selected same-workspace account verifies its media", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const legacyOrphan = {
    ...publishedPost,
    postVariant: { ...publishedPost.postVariant, instagramProviderAccountId: null, socialAccount: null }
  };
  const { deps, calls } = setup("owner", legacyOrphan);
  const service = createInstagramEngagementService(deps as never);

  assert.deepEqual(await service.recoverLegacyPostAccount("owner", ids.workspace, ids.schedule, ids.account), {
    accountLinkState: "connected"
  });
  assert.equal(calls.find((call) => call.method === "ownsMedia")?.args, "ig-media-123");
  assert.deepEqual(calls.find((call) => call.method === "postVariant.updateMany")?.args, {
    where: { id: "variant-a", platform: "instagram", instagramProviderAccountId: null, socialAccountId: null },
    data: { instagramProviderAccountId: "ig-123" }
  });
});

test("legacy account recovery rejects viewers, mismatched accounts, unverified media, and concurrent conflicts without linking", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const legacyOrphan = {
    ...publishedPost,
    postVariant: { ...publishedPost.postVariant, instagramProviderAccountId: null, socialAccount: null }
  };
  const cases = [
    { role: "viewer" as const, account: publishedPost.postVariant.socialAccount, owned: true, updateCount: 1 },
    { role: "owner" as const, account: { ...publishedPost.postVariant.socialAccount, workspaceId: "workspace-other" }, owned: true, updateCount: 1 },
    { role: "owner" as const, account: publishedPost.postVariant.socialAccount, owned: false, updateCount: 1 },
    { role: "owner" as const, account: publishedPost.postVariant.socialAccount, owned: true, updateCount: 0 },
    { role: "owner" as const, account: { ...publishedPost.postVariant.socialAccount, credential: { accessTokenEncrypted: "encrypted", scopes: [] } }, owned: true, updateCount: 1 }
  ];
  for (const scenario of cases) {
    const { deps, calls } = setup(scenario.role, legacyOrphan, "ig-media-123", [], scenario.account, scenario.owned, scenario.updateCount);
    const service = createInstagramEngagementService(deps as never);
    await assert.rejects(service.recoverLegacyPostAccount(scenario.role, ids.workspace, ids.schedule, ids.account));
    if (scenario.role === "viewer" || scenario.account.workspaceId !== ids.workspace || !scenario.owned) {
      assert.equal(calls.some((call) => call.method === "postVariant.updateMany"), false);
    }
  }
});

test("provider verification failures stay retryable and never write a recovered identity", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const legacyOrphan = {
    ...publishedPost,
    postVariant: { ...publishedPost.postVariant, instagramProviderAccountId: null, socialAccountId: null, socialAccount: null }
  };
  const { deps, calls } = setup("owner", legacyOrphan);
  const originalCreateClient = deps.createClient;
  deps.createClient = (input) => ({ ...originalCreateClient(input), ownsMedia: async () => { throw { kind: "rate_limited" }; } });
  const service = createInstagramEngagementService(deps as never);
  await assert.rejects(service.recoverLegacyPostAccount("owner", ids.workspace, ids.schedule, ids.account),
    (error: { statusCode?: number }) => error.statusCode === 429);
  assert.equal(calls.some((call) => call.method === "postVariant.updateMany"), false);
});

test("interaction reads resolve the saved provider account identity after its original row is removed", async () => {
  process.env.DATABASE_URL ??= "postgresql://app:secret@localhost:5432/social_scheduler";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.JWT_SECRET ??= "0123456789abcdef0123456789abcdef";
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const orphan = {
    ...publishedPost,
    postVariant: { ...publishedPost.postVariant, socialAccount: null }
  };
  const { deps, calls } = setup("viewer", orphan);
  const service = createInstagramEngagementService(deps as never);

  assert.deepEqual(await service.getPostMetrics("viewer", ids.workspace, ids.schedule), {
    likeCount: 4,
    commentCount: 2
  });
  const accountLookup = calls.find((call) => call.method === "socialAccount.findFirst")?.args as { where: Record<string, unknown> };
  assert.deepEqual(accountLookup.where, {
    workspaceId: ids.workspace,
    platform: "instagram",
    providerAccountId: "ig-123",
    status: "active"
  });
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
