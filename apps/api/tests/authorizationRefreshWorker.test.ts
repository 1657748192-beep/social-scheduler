import assert from "node:assert/strict";
import test from "node:test";
import { runAuthorizationChecks, authorizationRefreshIntervalsMs } from "../src/integrations/social/authorizationRefreshWorker";
import { PublishOutcomeUnknownError, hasRemainingPublishAttempts, persistConfirmedPublishResult } from "../src/integrations/social/publishOutcomeError";
import { FacebookPagePublisher } from "../src/integrations/social/facebookPagePublisher";
import { TikTokPublisher } from "../src/integrations/social/tiktokPublisher";
import { YouTubePublisher } from "../src/integrations/social/youtubePublisher";

test("runs every provider independently with the configured intervals", async () => {
  assert.deepEqual(authorizationRefreshIntervalsMs, {
    youtube: 30 * 60_000,
    tiktok: 6 * 60 * 60_000,
    facebook: 24 * 60 * 60_000
  });
  const withLease = async (_platform: string, check: () => Promise<number>) => check();
  assert.deepEqual(await runAuthorizationChecks({
    youtube: async () => 1, tiktok: async () => 0, facebook: async () => 2
  }, withLease), { youtube: 1, tiktok: 0, facebook: 2 });
});

test("one failed provider does not stop the rest or print a secret", async () => {
  const lines: string[] = [];
  const result = await runAuthorizationChecks({
    youtube: async () => { throw new Error("sensitive-token-value"); },
    tiktok: async () => 3,
    facebook: async () => 4
  }, async (_platform, check) => check(), (line) => { lines.push(line); });
  assert.deepEqual(result, { youtube: 0, tiktok: 3, facebook: 4 });
  assert.ok(lines.some((line) => line.includes("youtube")));
  assert.ok(!lines.join(" ").includes("sensitive-token-value"));
});

test("a provider timer runs only its own check", async () => {
  const called: string[] = [];
  await runAuthorizationChecks({
    youtube: async () => { called.push("youtube"); return 1; },
    tiktok: async () => { called.push("tiktok"); return 1; },
    facebook: async () => { called.push("facebook"); return 1; }
  }, async (_platform, check) => check(), () => {}, ["youtube"]);
  assert.deepEqual(called, ["youtube"]);
});

test("a shared lease prevents concurrent scans across Worker ticks or instances", async () => {
  const held = new Set<string>();
  let scans = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const withLease = async (platform: string, check: () => Promise<number>) => {
    if (held.has(platform)) return null;
    held.add(platform);
    try { return await check(); } finally { held.delete(platform); }
  };
  const checks = {
    youtube: async () => { scans += 1; await gate; return 1; },
    tiktok: async () => 0,
    facebook: async () => 0
  };
  const first = runAuthorizationChecks(checks, withLease);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = runAuthorizationChecks(checks, withLease);
  release();
  await Promise.all([first, second]);
  assert.equal(scans, 1);
});

test("unknown publish outcomes are terminal but safe pre-create failures can retry", () => {
  assert.equal(hasRemainingPublishAttempts(new PublishOutcomeUnknownError("Facebook"), 1, 3), false);
  assert.equal(hasRemainingPublishAttempts(new Error("Pre-create network error"), 1, 3), true);
  assert.equal(hasRemainingPublishAttempts(new Error("Final attempt"), 3, 3), false);
});

test("network uncertainty after a create request does not trigger another post", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("connection dropped after send"); };
  try {
    const facebook = new FacebookPagePublisher() as any;
    await assert.rejects(
      facebook.postToFacebook("account", "token", "https://graph.facebook.com/page/feed", new URLSearchParams(), "failed"),
      PublishOutcomeUnknownError
    );
    const tiktok = new TikTokPublisher() as any;
    await assert.rejects(
      tiktok.initializeDirectPost("account", "token", "caption", { fileUrl: "https://example.com/video.mp4" },
        { commentDisabled: false, duetDisabled: false, stitchDisabled: false },
        { privacyLevel: "SELF_ONLY", allowComment: true, allowDuet: true, allowStitch: true, brandOrganic: false, isAigc: false }),
      PublishOutcomeUnknownError
    );
    const youtube = new YouTubePublisher() as any;
    await assert.rejects(
      youtube.uploadVideo("account", "token", "https://example.com/upload", { mimeType: "video/mp4", sizeBytes: 1 },
        new ReadableStream<Uint8Array>()),
      PublishOutcomeUnknownError
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a persistence failure after provider confirmation cannot retry the create", async () => {
  await assert.rejects(
    persistConfirmedPublishResult(async () => { throw new Error("database response lost"); }, "Facebook"),
    PublishOutcomeUnknownError
  );
});

test("TikTok status lookup errors after accepted init cannot repeat initialization", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { code: "access_token_invalid", message: "expired" } }, { status: 401 });
  try {
    const tiktok = new TikTokPublisher() as any;
    await assert.rejects(tiktok.waitForPublishCompletion("token", "publish-id"), PublishOutcomeUnknownError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TikTok read-only creator check renews once after early token invalidation", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  let renewals = 0;
  globalThis.fetch = async (_url, init) => {
    seen.push(String((init?.headers as Record<string, string>)?.Authorization));
    return seen.length === 1
      ? Response.json({ error: { code: "access_token_invalid" } }, { status: 401 })
      : Response.json({ data: { creator_username: "creator", privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } });
  };
  try {
    const tiktok = new TikTokPublisher(async () => { renewals += 1; return "renewed-token"; }) as any;
    const info = await tiktok.queryCreatorPublishInfo("account", "old-token");
    assert.equal(info.creatorUsername, "creator");
    assert.deepEqual(seen, ["Bearer old-token", "Bearer renewed-token"]);
    assert.equal(renewals, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
