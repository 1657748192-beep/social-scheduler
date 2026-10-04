import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import test from "node:test";
import { createInstagramWebhookController } from "../src/controllers/instagramWebhookController";
import type { InstagramWebhookEvent } from "../src/services/instagramWebhookService";

function mockRequest(input: { query?: Record<string, unknown>; headers?: Record<string, string>; body?: unknown } = {}) {
  const headers = Object.fromEntries(Object.entries(input.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    query: input.query ?? {},
    body: input.body,
    header(name: string) { return headers[name.toLowerCase()]; }
  } as unknown as Request;
}

function mockResponse() {
  return {
    statusCode: 200,
    contentType: "",
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    type(value: string) { this.contentType = value; return this; },
    send(value: unknown) { this.body = value; return this; },
    json(value: unknown) { this.body = value; return this; }
  } as unknown as Response & { statusCode: number; body: unknown; contentType: string };
}

function signed(rawBody: string, secret = "app-secret") {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

test("answers the Meta subscription handshake only for the configured verify token", () => {
  const controller = createInstagramWebhookController({ verifyToken: "verify-token", appSecret: "app-secret" });
  const verified = mockResponse();
  controller.verify(mockRequest({ query: {
    "hub.mode": "subscribe", "hub.verify_token": "verify-token", "hub.challenge": "challenge-123"
  } }), verified);
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.body, "challenge-123");
  assert.equal(verified.contentType, "text/plain");

  const rejected = mockResponse();
  controller.verify(mockRequest({ query: {
    "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "challenge-123"
  } }), rejected);
  assert.equal(rejected.statusCode, 403);
  assert.equal(String(rejected.body).includes("verify-token"), false);
});

test("accepts valid signed comments and messages while exposing only identifiers", async () => {
  const seen: InstagramWebhookEvent[] = [];
  const controller = createInstagramWebhookController({
    verifyToken: "verify-token", appSecret: "app-secret", onEvent: (event) => seen.push(event)
  });
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      { id: "ig-account", time: 1791072000, changes: [{ field: "comments", value: { id: "comment-1", text: "private comment content", media: { id: "media-1" }, from: { username: "customer" } } }] },
      { id: "ig-account", time: 1791072001, messaging: [{ sender: { id: "customer-1" }, recipient: { id: "ig-account" }, timestamp: 1791072001000, message: { mid: "message-1", text: "private dm content" } }] }
    ]
  });
  const res = mockResponse();

  await controller.receive(mockRequest({
    headers: { "X-Hub-Signature-256": signed(body) }, body: Buffer.from(body)
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: 2, duplicates: 0, ignored: 0 });
  assert.deepEqual(seen, [
    { accountId: "ig-account", field: "comments", eventId: "comment-1", mediaId: "media-1", timestamp: 1791072000000 },
    { accountId: "ig-account", field: "messages", eventId: "message-1", senderId: "customer-1", recipientId: "ig-account", timestamp: 1791072001000 }
  ]);
  assert.equal(JSON.stringify(seen).includes("private comment content"), false);
  assert.equal(JSON.stringify(seen).includes("private dm content"), false);
  assert.equal(JSON.stringify(seen).includes("username"), false);
});

test("rejects forged signatures before processing and handles duplicate or unknown events safely", async () => {
  let processed = 0;
  const controller = createInstagramWebhookController({
    verifyToken: "verify-token", appSecret: "app-secret", onEvent: () => { processed += 1; }
  });
  const body = JSON.stringify({ object: "instagram", entry: [{ id: "ig-account", time: 1791072000, changes: [{ field: "comments", value: { id: "comment-1", media: { id: "media-1" } } }] }] });
  const forged = mockResponse();
  await controller.receive(mockRequest({ headers: { "X-Hub-Signature-256": `sha256=${"0".repeat(64)}` }, body: Buffer.from(body) }), forged);
  assert.equal(forged.statusCode, 403);
  assert.equal(String(forged.body).includes("comment-1"), false);
  assert.equal(processed, 0);

  const first = mockResponse();
  await controller.receive(mockRequest({ headers: { "X-Hub-Signature-256": signed(body) }, body: Buffer.from(body) }), first);
  assert.deepEqual(first.body, { received: 1, duplicates: 0, ignored: 0 });
  const duplicate = mockResponse();
  await controller.receive(mockRequest({ headers: { "X-Hub-Signature-256": signed(body) }, body: Buffer.from(body) }), duplicate);
  assert.deepEqual(duplicate.body, { received: 0, duplicates: 1, ignored: 0 });

  const unknownBody = JSON.stringify({ object: "instagram", entry: [{ id: "ig-account", changes: [{ field: "mentions", value: { id: "unknown" } }] }] });
  const unknown = mockResponse();
  await controller.receive(mockRequest({ headers: { "X-Hub-Signature-256": signed(unknownBody) }, body: Buffer.from(unknownBody) }), unknown);
  assert.deepEqual(unknown.body, { received: 0, duplicates: 0, ignored: 1 });
  assert.equal(processed, 1);
});

test("rejects missing raw body and malformed signed JSON without echoing its contents", async () => {
  const controller = createInstagramWebhookController({ verifyToken: "verify-token", appSecret: "app-secret" });
  const missingRaw = mockResponse();
  await controller.receive(mockRequest({ headers: { "X-Hub-Signature-256": signed("") }, body: undefined }), missingRaw);
  assert.equal(missingRaw.statusCode, 400);

  const body = "not-json-with-private-content";
  const malformed = mockResponse();
  await controller.receive(mockRequest({ headers: { "X-Hub-Signature-256": signed(body) }, body: Buffer.from(body) }), malformed);
  assert.equal(malformed.statusCode, 400);
  assert.equal(JSON.stringify(malformed.body).includes(body), false);
});

test("fails closed when webhook credentials are not configured", async () => {
  const controller = createInstagramWebhookController({ verifyToken: "", appSecret: "" });
  const handshake = mockResponse();
  controller.verify(mockRequest({ query: { "hub.mode": "subscribe", "hub.verify_token": "any", "hub.challenge": "abc" } }), handshake);
  assert.equal(handshake.statusCode, 503);

  const receive = mockResponse();
  await controller.receive(mockRequest({ body: Buffer.from("{}") }), receive);
  assert.equal(receive.statusCode, 503);
});
