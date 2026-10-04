import { createHmac, timingSafeEqual } from "node:crypto";

export type InstagramWebhookEvent = {
  accountId: string;
  field: "comments" | "live_comments" | "messages";
  eventId: string;
  mediaId?: string;
  senderId?: string;
  recipientId?: string;
  timestamp?: number;
};

type JsonRecord = Record<string, unknown>;
type EventHandler = (event: InstagramWebhookEvent) => void | Promise<void>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function timestamp(value: unknown, seconds = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return seconds ? value * 1000 : value;
}

export function isValidInstagramWebhookSignature(rawBody: Buffer, signature: string | undefined, appSecret: string) {
  if (!signature || !appSecret) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature);
  if (!match) return false;
  const received = Buffer.from(match[1], "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function isInstagramWebhookVerifyTokenValid(receivedToken: string | undefined, expectedToken: string) {
  if (!receivedToken || !expectedToken) return false;
  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createInstagramWebhookProcessor(input: { onEvent?: EventHandler; now?: () => number } = {}) {
  const onEvent = input.onEvent ?? (() => undefined);
  const now = input.now ?? Date.now;
  const seen = new Map<string, number>();
  const maxKeys = 10_000;
  const ttlMs = 6 * 60 * 60 * 1000;

  function isDuplicate(key: string) {
    const currentTime = now();
    for (const [existingKey, expiresAt] of seen) {
      if (expiresAt > currentTime) break;
      seen.delete(existingKey);
    }
    if (seen.has(key)) return true;
    seen.set(key, currentTime + ttlMs);
    if (seen.size > maxKeys) {
      const oldest = seen.keys().next().value;
      if (oldest) seen.delete(oldest);
    }
    return false;
  }

  return async function processInstagramWebhookPayload(payload: unknown) {
    const root = record(payload);
    if (!root || !Array.isArray(root.entry)) throw new Error("Invalid Instagram webhook payload");
    if (root.object !== "instagram") return { received: 0, duplicates: 0, ignored: 1 };

    let received = 0;
    let duplicates = 0;
    let ignored = 0;
    for (const rawEntry of root.entry) {
      const entry = record(rawEntry);
      const accountId = entry && text(entry.id);
      if (!entry || !accountId) {
        ignored += 1;
        continue;
      }
      const entryTime = timestamp(entry.time, true);

      if (Array.isArray(entry.changes)) {
        for (const rawChange of entry.changes) {
          const change = record(rawChange);
          const field = change && text(change.field);
          const value = change && record(change.value);
          const eventId = value && text(value.id);
          const media = value && record(value.media);
          const mediaId = media && text(media.id);
          if ((field !== "comments" && field !== "live_comments") || !eventId || !mediaId) {
            ignored += 1;
            continue;
          }
          const event: InstagramWebhookEvent = {
            accountId,
            field,
            eventId,
            mediaId,
            timestamp: timestamp(value.timestamp) ?? entryTime
          };
          if (isDuplicate(`${accountId}:${field}:${eventId}:${event.timestamp ?? ""}`)) {
            duplicates += 1;
            continue;
          }
          await onEvent(event);
          received += 1;
        }
      }

      if (Array.isArray(entry.messaging)) {
        for (const rawMessaging of entry.messaging) {
          const messaging = record(rawMessaging);
          const message = messaging && record(messaging.message);
          const eventId = message && text(message.mid);
          const sender = messaging && record(messaging.sender);
          const recipient = messaging && record(messaging.recipient);
          const senderId = sender && text(sender.id);
          const recipientId = recipient && text(recipient.id);
          const time = messaging && timestamp(messaging.timestamp) || entryTime;
          if (!eventId || !senderId || !recipientId) {
            ignored += 1;
            continue;
          }
          const event: InstagramWebhookEvent = {
            accountId,
            field: "messages",
            eventId,
            senderId,
            recipientId,
            timestamp: time
          };
          if (isDuplicate(`${accountId}:messages:${eventId}:${time ?? ""}`)) {
            duplicates += 1;
            continue;
          }
          await onEvent(event);
          received += 1;
        }
      }
    }
    return { received, duplicates, ignored };
  };
}
