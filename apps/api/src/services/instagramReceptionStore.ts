import type { PrismaClient, Prisma } from "@prisma/client";

export type ReceivedEvent = {
  accountId: string; field: "comments" | "live_comments" | "messages"; eventId: string;
  mediaId?: string; senderId?: string; recipientId?: string; timestamp?: number;
  text?: string; username?: string; attachments?: Array<{ type: string; url?: string }>;
  isEcho?: boolean;
};

const pageLimit = (value = 25) => Math.max(1, Math.min(100, Math.floor(value) || 25));
const localId = (id: string) => `local:${id}`;
const threadId = (id: string) => /^local:[0-9a-f-]{36}$/i.test(id) ? id.slice(6) : null;
function page<T extends { id: string }>(rows: T[], limit: number) {
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}
function occurred(event: ReceivedEvent) {
  // Missing/future provider times must never create a fresh inbound reply window.
  return new Date(event.timestamp && event.timestamp <= Date.now() ? event.timestamp : 0);
}

export function createInstagramReceptionStore(db: PrismaClient, retentionDays = 90) {
  const cutoff = () => new Date(Date.now() - retentionDays * 86400000);
  async function revision(tx: Prisma.TransactionClient, socialAccountId: string) {
    await tx.instagramReceptionState.createMany({ data: [{ socialAccountId }], skipDuplicates: true });
    await tx.instagramReceptionState.update({ where: { socialAccountId }, data: { revision: { increment: 1 }, lastReceivedAt: new Date() } });
  }
  return {
    async recordComment(socialAccountId: string, event: ReceivedEvent) {
      if (!event.mediaId) throw new Error("Comment media is required");
      await db.$transaction(async tx => {
        const result = await tx.instagramReceivedComment.createMany({ skipDuplicates: true, data: [{
          socialAccountId, providerCommentId: event.eventId, mediaId: event.mediaId!,
          text: event.text, username: event.username, senderId: event.senderId, occurredAt: occurred(event)
        }] });
        if (result.count) await revision(tx, socialAccountId);
      });
    },
    async recordMessage(socialAccountId: string, event: ReceivedEvent) {
      if (!event.senderId || !event.recipientId) throw new Error("Message participants are required");
      const inbound = !event.isEcho && event.recipientId === event.accountId && event.senderId !== event.accountId;
      const counterpartyId = inbound ? event.senderId : event.recipientId;
      await db.$transaction(async tx => {
        await tx.instagramReceivedThread.createMany({ data: [{ socialAccountId, counterpartyId }], skipDuplicates: true });
        const thread = await tx.instagramReceivedThread.findUniqueOrThrow({ where: { socialAccountId_counterpartyId: { socialAccountId, counterpartyId } } });
        const result = await tx.instagramReceivedMessage.createMany({ skipDuplicates: true, data: [{
          threadId: thread.id, providerMessageId: event.eventId, senderId: event.senderId!, recipientId: event.recipientId!,
          text: event.text, attachments: event.attachments ?? [], inbound, occurredAt: occurred(event)
        }] });
        if (result.count) {
          await tx.instagramReceivedThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
          await revision(tx, socialAccountId);
        }
      });
    },
    async listComments(socialAccountId: string, mediaId: string, after?: string, limit = 25) {
      limit = pageLimit(limit);
      const rows = await db.instagramReceivedComment.findMany({ where: { socialAccountId, mediaId, receivedAt: { gte: cutoff() }, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: limit + 1 });
      const result = page(rows, limit);
      return { ...result, items: result.items.map(r => ({ id: r.providerCommentId, text: r.text ?? "", username: r.username ?? undefined, timestamp: r.occurredAt.toISOString(), source: "received" as const, receivedAt: r.receivedAt.toISOString() })) };
    },
    async getComment(socialAccountId: string, mediaId: string, providerCommentId: string) {
      return db.instagramReceivedComment.findFirst({ where: { socialAccountId, mediaId, providerCommentId, receivedAt: { gte: cutoff() } } });
    },
    async listThreads(socialAccountId: string, after?: string, limit = 25) {
      limit = pageLimit(limit);
      const previous = after ? await db.instagramReceivedThread.findFirst({ where: { id: after, socialAccountId } }) : null;
      const rows = await db.instagramReceivedThread.findMany({ where: { socialAccountId, messages: { some: { receivedAt: { gte: cutoff() } } }, ...(previous ? { OR: [{ updatedAt: { lt: previous.updatedAt } }, { updatedAt: previous.updatedAt, id: { lt: previous.id } }] } : {}) }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: limit + 1 });
      const result = page(rows, limit);
      return { ...result, items: result.items.map(r => ({ id: localId(r.id), counterpartyId: r.counterpartyId, providerConversationId: r.providerConversationId, updated_time: r.updatedAt.toISOString(), participants: { data: [{ id: r.counterpartyId }] }, source: "received" as const })) };
    },
    async getThread(socialAccountId: string, id: string) {
      const parsed = threadId(id);
      if (!parsed) return null;
      return db.instagramReceivedThread.findFirst({ where: { id: parsed, socialAccountId } });
    },
    async getThreadByCounterparty(socialAccountId: string, counterpartyId: string) {
      const thread = await db.instagramReceivedThread.findUnique({ where: { socialAccountId_counterpartyId: { socialAccountId, counterpartyId } } });
      return thread ? { ...thread, id: localId(thread.id) } : null;
    },
    async linkConversation(socialAccountId: string, id: string, providerConversationId: string) {
      const parsed = threadId(id);
      if (!parsed) return;
      await db.instagramReceivedThread.updateMany({ where: { id: parsed, socialAccountId }, data: { providerConversationId } });
    },
    async listMessages(socialAccountId: string, id: string, after?: string, limit = 50) {
      const parsed = threadId(id);
      if (!parsed) return { items: [], nextCursor: null };
      limit = pageLimit(limit);
      const previous = after ? await db.instagramReceivedMessage.findFirst({ where: { id: after, threadId: parsed, thread: { socialAccountId } } }) : null;
      const rows = await db.instagramReceivedMessage.findMany({ where: { threadId: parsed, thread: { socialAccountId }, receivedAt: { gte: cutoff() }, ...(previous ? { OR: [{ occurredAt: { lt: previous.occurredAt } }, { occurredAt: previous.occurredAt, id: { lt: previous.id } }] } : {}) }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: limit + 1 });
      const result = page(rows, limit);
      return { ...result, items: result.items.map(r => ({ id: r.providerMessageId, message: r.text ?? "", created_time: r.occurredAt.toISOString(), from: { id: r.senderId }, to: { data: [{ id: r.recipientId }] }, inbound: r.inbound, source: "received" as const, receivedAt: r.receivedAt.toISOString(), attachments: r.attachments })) };
    },
    async latestInbound(socialAccountId: string, id: string) {
      const parsed = threadId(id);
      if (!parsed) return null;
      return db.instagramReceivedMessage.findFirst({ where: { threadId: parsed, thread: { socialAccountId }, inbound: true, receivedAt: { gte: cutoff() } }, orderBy: { occurredAt: "desc" } });
    },
    async getStatus(socialAccountId: string) {
      const state = await db.instagramReceptionState.findUnique({ where: { socialAccountId } });
      return { revision: String(state?.revision ?? 0), lastReceivedAt: state?.lastReceivedAt?.toISOString() ?? null };
    },
    async cleanup(before: Date, batchSize: number) {
      const take = pageLimit(batchSize) * 5;
      const comments = await db.instagramReceivedComment.findMany({ where: { receivedAt: { lt: before } }, select: { id: true }, take });
      const messages = await db.instagramReceivedMessage.findMany({ where: { receivedAt: { lt: before } }, select: { id: true }, take });
      await db.instagramReceivedComment.deleteMany({ where: { id: { in: comments.map(r => r.id) } } });
      await db.instagramReceivedMessage.deleteMany({ where: { id: { in: messages.map(r => r.id) } } });
      return { comments: comments.length, messages: messages.length };
    }
  };
}

export type InstagramReceptionStore = ReturnType<typeof createInstagramReceptionStore>;
export type ReceivedComment = Awaited<ReturnType<InstagramReceptionStore["listComments"]>>["items"][number];
export type ReceivedMessage = Awaited<ReturnType<InstagramReceptionStore["listMessages"]>>["items"][number];
export type ReceivedThread = Awaited<ReturnType<InstagramReceptionStore["listThreads"]>>["items"][number];
export type ReceptionState = Awaited<ReturnType<InstagramReceptionStore["getStatus"]>>;
