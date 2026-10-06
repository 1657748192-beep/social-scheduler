import assert from "node:assert/strict";
import test from "node:test";
import { createReceptionPoller, instagramReadNotice, readInstagramPostActivity, instagramInboxReadNotice } from "../lib/instagramReception";

test("reception polling skips hidden pages, reloads changed revisions and stops stale callbacks", async () => {
  let tick: () => Promise<void> = async () => {};
  let visible = true, reads = 0, revision = "1", reloads = 0;
  let release: ((value: { revision: string }) => void) | null = null;
  const poller = createReceptionPoller({ readStatus: async () => { reads++; return release ? new Promise<{ revision: string }>(resolve => { release = resolve; }) : { revision }; },
    onRevision: async () => { reloads++; }, isVisible: () => visible, intervalMs: 15000,
    schedule: fn => { tick = fn; return () => {}; } });
  await tick();
  visible = false; await tick(); assert.equal(reads, 1);
  visible = true; revision = "2"; await tick(); assert.equal(reloads, 2);
  await tick(); assert.equal(reloads, 2);
  release = () => {};
  const pending = tick(); poller.stop(); release!({ revision: "3" }); await pending;
  assert.equal(reloads, 2);
  const before = reads; await tick(); assert.equal(reads, before);
});

test("first visible revision refreshes data and a failed refresh is retried without consuming revision", async () => {
  let tick = async () => {}, reloads = 0;
  const poller = createReceptionPoller({ readStatus: async () => ({ revision: "already-arrived" }), isVisible: () => true, intervalMs: 15000,
    onRevision: async () => { if (++reloads === 1) throw new Error("network"); }, schedule: fn => { tick = fn; return () => {}; } });
  await tick(); await tick(); await tick(); poller.stop();
  assert.equal(reloads, 2);
});

test("provider visibility warning differs from no comments and preserves provider error", () => {
  assert.equal(instagramReadNotice({ providerReadStatus: "empty" }, 3, 0), "visibility");
  assert.equal(instagramReadNotice({ providerReadStatus: "empty" }, 0, 0), null);
  assert.equal(instagramReadNotice({ providerReadStatus: "error" }, 3, 1), "provider_error");
});

test("received comments survive a metrics outage and message-level failures are visible independently", async () => {
  const result = await readInstagramPostActivity(async () => { throw new Error("metrics unavailable"); }, async () => ({ items: [{ id: "received" }] }));
  assert.equal(result.comments.data?.items[0].id, "received");
  assert.ok(result.metrics.error);
  assert.equal(instagramInboxReadNotice({ providerReadStatus: "ok" }, { providerReadStatus: "error" }), "provider_error");
});
