import assert from "node:assert/strict";
import test from "node:test";

test("received-thread replies require scoped ownership, writer role and genuine recent inbound", async () => {
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  const now = new Date("2026-10-06T12:00:00Z");
  let sent = 0, saved = 0;
  for (const scenario of [
    { role: "viewer", thread: true, time: "2026-10-06T11:00:00Z", allowed: false },
    { role: "editor", thread: false, time: "2026-10-06T11:00:00Z", allowed: false },
    { role: "editor", thread: true, time: null, allowed: false },
    { role: "editor", thread: true, time: "2026-10-06T12:01:00Z", allowed: false },
    { role: "editor", thread: true, time: "2026-10-05T11:59:59Z", allowed: false },
    { role: "editor", thread: true, time: "2026-10-05T12:00:00Z", allowed: true }
  ]) {
    const account = { id: "account", workspaceId: "workspace", platform: "instagram", providerAccountId: "owner", status: "active", credential: { accessTokenEncrypted: "fixture", scopes: ["instagram_business_manage_messages"] } };
    const service = createInstagramEngagementService({ prisma: { socialAccount: { findFirst: async () => account } },
      requireWorkspaceMembership: async () => ({ role: scenario.role }), decryptToken: () => "fixture", now: () => now,
      createClient: () => ({ sendMessage: async (recipient: string) => { assert.equal(recipient, "customer"); sent++; return { messageId: "sent-id" }; } }),
      receptionStore: { getThread: async (id: string) => { assert.equal(id, "account"); return scenario.thread ? { counterpartyId: "customer" } : null; },
        latestInbound: async () => scenario.time ? { senderId: "customer", occurredAt: new Date(scenario.time) } : null,
        recordMessage: async (id: string, event: any) => { assert.equal(id, "account"); assert.equal(event.isEcho, true); saved++; } }
    } as never);
    if (scenario.allowed) assert.equal((await service.replyToConversation("user", "workspace", "account", "local:opaque", "test")).messageId, "sent-id");
    else await assert.rejects(service.replyToConversation("user", "workspace", "account", "local:opaque", "test"));
  }
  assert.equal(sent, 1); assert.equal(saved, 1);
});

test("successful provider-thread sends persist outbound history and local save failure is not a send failure", async () => {
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  let saves = 0;
  const account = { id: "account", workspaceId: "workspace", platform: "instagram", providerAccountId: "owner", status: "active", credential: { accessTokenEncrypted: "fixture", scopes: ["instagram_business_manage_messages"] } };
  const service = createInstagramEngagementService({ prisma: { socialAccount: { findFirst: async () => account } },
    requireWorkspaceMembership: async () => ({ role: "editor" }), decryptToken: () => "fixture", now: () => new Date("2026-10-06T12:00:00Z"),
    createClient: () => ({ getConversation: async () => ({ id: "live", participantIds: ["owner", "customer"] }),
      listMessages: async () => ({ items: [{ id: "in", from: { id: "customer" }, created_time: "2026-10-06T11:00:00Z" }], nextCursor: null }),
      sendMessage: async () => ({ messageId: "sent" }) }),
    receptionStore: { recordMessage: async (_id: string, event: any) => { assert.equal(event.recipientId, "customer"); saves++; throw new Error("local unavailable"); } }
  } as never);
  const result = await service.replyToConversation("user", "workspace", "account", "live", "test");
  assert.equal(saves, 1); assert.equal(result.messageId, "sent"); assert.equal((result as any).localSaveStatus, "failed");
});

test("a reconciled local thread may use a verified live inbound without an earlier webhook", async () => {
  const { createInstagramEngagementService } = await import("../src/services/instagramEngagementService");
  let sent = false;
  const service = createInstagramEngagementService({ prisma: { socialAccount: { findFirst: async () => ({ id: "account", workspaceId: "workspace", platform: "instagram", providerAccountId: "owner", status: "active", credential: { accessTokenEncrypted: "fixture", scopes: ["instagram_business_manage_messages"] } }) } },
    requireWorkspaceMembership: async () => ({ role: "editor" }), decryptToken: () => "fixture", now: () => new Date("2026-10-06T12:00:00Z"),
    createClient: () => ({ getConversation: async () => ({ id: "live", participantIds: ["owner", "customer"] }),
      listMessages: async () => ({ items: [{ id: "in", from: { id: "customer" }, created_time: "2026-10-06T11:00:00Z" }], nextCursor: null }),
      sendMessage: async () => { sent = true; return { messageId: "sent" }; } }),
    receptionStore: { getThread: async () => ({ counterpartyId: "customer", providerConversationId: "live" }), latestInbound: async () => null, recordMessage: async () => {} }
  } as never);
  await service.replyToConversation("user", "workspace", "account", "local:opaque", "test");
  assert.equal(sent, true);
});
