import assert from "node:assert/strict";
import test from "node:test";
import { createInstagramReceptionService } from "../src/services/instagramReceptionService";

test("reception resolves active accounts independently and ignores unowned participants", async () => {
  const saved: string[] = [];
  const service = createInstagramReceptionService({
    findAccounts: async () => [
      { id: "a", providerAccountId: "owner", status: "active", scopes: ["instagram_business_manage_messages"] },
      { id: "b", providerAccountId: "owner", status: "active", scopes: ["instagram_business_manage_messages"] },
      { id: "revoked", providerAccountId: "owner", status: "disconnected", scopes: ["instagram_business_manage_messages"] }
    ],
    store: { recordMessage: async id => { saved.push(id); }, recordComment: async () => { throw new Error("unexpected comment"); } }
  });
  await service.receive({ accountId: "owner", field: "messages", eventId: "m", senderId: "customer", recipientId: "owner" });
  assert.deepEqual(saved, ["a", "b"]);
  await service.receive({ accountId: "owner", field: "messages", eventId: "forged", senderId: "someone", recipientId: "another" });
  assert.deepEqual(saved, ["a", "b"]);
});
