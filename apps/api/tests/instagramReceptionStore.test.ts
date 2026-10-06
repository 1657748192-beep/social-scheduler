import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createInstagramReceptionStore } from "../src/services/instagramReceptionStore";

// This opt-in integration test uses a disposable database, never DATABASE_URL.
test("received content survives duplicate writes, isolates accounts, paginates and expires at a strict cutoff", { skip: !process.env.INSTAGRAM_TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ datasourceUrl: process.env.INSTAGRAM_TEST_DATABASE_URL });
  const store = createInstagramReceptionStore(db);
  const user = await db.user.create({ data: { email: `reception-${Date.now()}@example.invalid`, name: "test", passwordHash: "fixture" } });
  try {
    const w = await db.workspace.create({ data: { name: "test", slug: `reception-${Date.now()}`, ownerId: user.id } });
    const a = await db.socialAccount.create({ data: { workspaceId: w.id, platform: "instagram", providerAccountId: "owner", displayName: "a" } });
    const b = await db.socialAccount.create({ data: { workspaceId: w.id, platform: "instagram", providerAccountId: "other", displayName: "b" } });
    const event = { eventId: "m1", senderId: "customer", recipientId: "owner", text: "hello", timestamp: Date.parse("2026-10-01T00:00:00Z"), field: "messages" as const, accountId: "owner" };
    await Promise.all([store.recordMessage(a.id, event), store.recordMessage(a.id, event)]);
    await createInstagramReceptionStore(db).recordMessage(a.id, event);
    const threads = await store.listThreads(a.id);
    assert.equal(threads.items.length, 1);
    const thread = threads.items[0];
    assert.match(thread.id, /^local:/);
    assert.equal((await store.listMessages(a.id, thread.id)).items.length, 1);
    await store.recordMessage(a.id, { ...event, eventId: "outgoing", senderId: "owner", recipientId: "customer", isEcho: true, timestamp: Date.now() });
    await store.recordMessage(a.id, { ...event, eventId: "outgoing", senderId: "owner", recipientId: "customer", isEcho: true, timestamp: Date.now() });
    assert.equal((await store.listMessages(a.id, thread.id)).items.length, 2);
    assert.equal((await store.latestInbound(a.id, thread.id))?.providerMessageId, "m1");
    // More than a visible page must still expose the latest inbound first.
    for (let n = 0; n < 55; n++) await store.recordMessage(a.id, { ...event, eventId: `bulk-${n}`, timestamp: event.timestamp + n * 1000 });
    assert.equal((await store.listMessages(a.id, thread.id, undefined, 1)).items[0].id, "outgoing");
    const latestPage = await store.listMessages(a.id, thread.id, undefined, 1);
    const olderPage = await store.listMessages(a.id, thread.id, latestPage.nextCursor!, 1);
    assert.equal(olderPage.items[0].id, "bulk-54");
    assert.equal(await store.getThread(b.id, thread.id), null);
    await store.recordComment(a.id, { accountId: "owner", field: "comments", eventId: "c1", mediaId: "media", text: "one", timestamp: event.timestamp });
    await store.recordComment(a.id, { accountId: "owner", field: "comments", eventId: "c2", mediaId: "media", text: "two", timestamp: event.timestamp });
    await store.recordComment(b.id, { accountId: "other", field: "comments", eventId: "c1", mediaId: "media", text: "separate", timestamp: event.timestamp });
    const first = await store.listComments(a.id, "media", undefined, 1);
    assert.equal(first.items.length, 1);
    assert.ok(first.nextCursor);
    const second = await store.listComments(a.id, "media", first.nextCursor!, 1);
    assert.notEqual(first.items[0].id, second.items[0].id);
    assert.equal((await store.listComments(b.id, "media")).items[0].text, "separate");
    const received = await db.instagramReceivedComment.findFirstOrThrow({ where: { socialAccountId: a.id } });
    await store.cleanup(received.receivedAt, 500);
    assert.ok((await store.listComments(a.id, "media")).items.some(c => c.id === received.providerCommentId));
    await store.cleanup(new Date(Date.now() + 1000), 500);
    assert.equal((await store.listMessages(a.id, thread.id)).items.length, 0);
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
