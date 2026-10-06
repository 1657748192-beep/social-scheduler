import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TikTokSandboxView, TikTokSandboxOutcome } from "../components/channels/TikTokSandboxPanel";
const props = { status: { eligible: true, connected: true }, busy: false, error: "", posts: [], selected: "", nextCursor: null,
  stats: null, metrics: null, onAction: () => {}, onSelect: () => {}, t: (_zh: string, en: string) => en };

test("successful metrics remove both pending ID hints for the selected video in both languages", () => {
  for (const t of [props.t, (zh: string, _en: string) => zh]) {
    const html = renderToStaticMarkup(React.createElement(TikTokSandboxView, { ...props, t,
      posts: [{ id: "one", videoId: "", text: "Published video" }], selected: "one",
      metrics: { status: "ok", viewCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, fetchedAt: "2026-10-06T06:34:59Z" } }));
    assert.doesNotMatch(html, /lookup pending|待查询视频 ID|look up its actual video ID|将查询真实视频 ID/);
    assert.match(html, /Published video/);
    assert.match(html, /<dd>0<\/dd>/);
  }
});

test("missing or failed metrics retain the lookup hints", () => {
  for (const metrics of [null, { status: "video_id_missing" as const }, { status: "temporarily_unavailable" as const }]) {
    const html = renderToStaticMarkup(React.createElement(TikTokSandboxView, { ...props,
      posts: [{ id: "one", videoId: "", text: "Published video" }], selected: "one", metrics }));
    assert.match(html, /lookup pending/);
    assert.match(html, /look up its actual video ID/);
  }
});

test("one video's success does not remove another video's pending label", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokSandboxView, { ...props,
    posts: [{ id: "one", videoId: "", text: "First" }, { id: "two", videoId: "", text: "Second" }], selected: "one",
    metrics: { status: "ok", viewCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, fetchedAt: "2026-10-06T06:34:59Z" } }));
  assert.match(html, /Second \(video ID lookup pending\)/);
  assert.doesNotMatch(html, /First \(video ID lookup pending\)/);
});
test("ineligible user sees no sandbox controls", () => {
  assert.equal(renderToStaticMarkup(React.createElement(TikTokSandboxView, { ...props, status: { eligible: false, connected: false } })), "");
});
test("eligible user sees a read-only named sandbox and no publish controls", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokSandboxView, props));
  assert.match(html, /TikTok Sandbox metrics test/); assert.match(html, /andypeng97/); assert.match(html, /Read-only/);
  assert.match(html, /Refresh account statistics/); assert.doesNotMatch(html, /<dt>|client_secret|Publish now/);
});
test("disconnected state offers test authorization but no enabled data actions", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokSandboxView, { ...props, status: { eligible: true, connected: false } }));
  assert.match(html, /Connect sandbox/); assert.doesNotMatch(html, /Refresh account statistics/);
});
test("OAuth failure is visible independently of existing connection and never reflects query secrets", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokSandboxOutcome, { search: "?tiktok_sandbox=failed&code=SECRET&state=SECRET", t: props.t }));
  assert.match(html, /role="alert"/); assert.match(html, /authorization failed/i); assert.doesNotMatch(html, /SECRET/);
});
test("OAuth outcome accepts only fixed values and distinguishes success", () => {
  const render = (search: string) => renderToStaticMarkup(React.createElement(TikTokSandboxOutcome, { search, t: props.t }));
  assert.match(render("?tiktok_sandbox=connected"), /role="status"/);
  assert.equal(render("?tiktok_sandbox=SECRET"), ""); assert.equal(render(""), "");
});
