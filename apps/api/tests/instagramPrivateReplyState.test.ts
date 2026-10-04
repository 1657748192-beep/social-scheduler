import assert from "node:assert/strict";
import test from "node:test";
import {
  claimInstagramPrivateReplyAttempt,
  finishInstagramPrivateReplyAttempt,
  type PrivateReplyAttemptStore
} from "../src/services/instagramPrivateReplyStateService";

function createMemoryStore(): PrivateReplyAttemptStore & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    async create(data) {
      if (rows.some((row) => row.socialAccountId === data.socialAccountId && row.commentId === data.commentId)) {
        throw { code: "P2002" };
      }
      const timestamp = new Date();
      const row = {
        id: String(rows.length + 1),
        ...data,
        status: "pending",
        providerMessageId: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      rows.push(row);
      return row;
    },
    async updatePending(data, update) {
      const row = rows.find((item) => item.socialAccountId === data.socialAccountId && item.commentId === data.commentId && item.status === "pending");
      if (!row) return 0;
      Object.assign(row, update);
      return 1;
    }
  };
}

const input = {
  socialAccountId: "account-1",
  mediaId: "media-1",
  commentId: "comment-1"
};

test("claims a private reply exactly once per Instagram account and comment", async () => {
  const store = createMemoryStore();

  assert.deepEqual(await claimInstagramPrivateReplyAttempt(store, input), { claimed: true });
  assert.deepEqual(await claimInstagramPrivateReplyAttempt(store, input), { claimed: false, reason: "already_attempted" });
  assert.equal(store.rows.length, 1);
});

test("only a pending attempt can transition to sent or failed", async () => {
  const store = createMemoryStore();
  await claimInstagramPrivateReplyAttempt(store, input);

  assert.equal(await finishInstagramPrivateReplyAttempt(store, { ...input, status: "sent", providerMessageId: "message-1" }), true);
  assert.equal(await finishInstagramPrivateReplyAttempt(store, { ...input, status: "failed" }), false);
  assert.equal(store.rows[0].status, "sent");
});

test("failure remains claimed and no stored input can contain message text or tokens", async () => {
  const store = createMemoryStore();
  await claimInstagramPrivateReplyAttempt(store, input);
  await finishInstagramPrivateReplyAttempt(store, { ...input, status: "failed" });

  assert.deepEqual(Object.keys(store.rows[0]).sort(), [
    "commentId", "createdAt", "id", "mediaId", "providerMessageId", "socialAccountId", "status", "updatedAt"
  ]);
  assert.deepEqual(await claimInstagramPrivateReplyAttempt(store, input), { claimed: false, reason: "already_attempted" });
});

test("treats a database unique-constraint race as an already attempted reply", async () => {
  const store: PrivateReplyAttemptStore = {
    async create() { throw { code: "P2002" }; },
    async updatePending() { return 0; }
  };

  assert.deepEqual(await claimInstagramPrivateReplyAttempt(store, input), { claimed: false, reason: "already_attempted" });
});
