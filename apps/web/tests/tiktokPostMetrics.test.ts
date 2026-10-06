import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TikTokMetricsSummary } from "../components/posts/TikTokMetricsSummary";

const english = (_zh: string, en: string) => en;
test("renders all four TikTok counts including genuine zero and fetch time", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokMetricsSummary, { t: english, result: {
    status: "ok", viewCount: 123, likeCount: 0, commentCount: 4, shareCount: 2, fetchedAt: "2026-10-06T00:00:00Z"
  } }));
  for (const label of ["123", "Views", "0", "Likes", "4", "Comments", "2", "Shares", "2026-10-06T00:00:00Z"]) assert.ok(html.includes(label));
});

test("missing data permission is optional and does not show made-up statistics", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokMetricsSummary, { t: english, result: { status: "permission_missing" } }));
  assert.match(html, /video.list/);
  assert.match(html, /publishing/);
  assert.doesNotMatch(html, /<dt>/);
});

test("private, missing and empty results each explain why counts are absent", () => {
  for (const [status, explanation] of [["private_video", /public videos/], ["video_id_missing", /video ID/], ["video_unavailable", /did not return/]] as const) {
    const html = renderToStaticMarkup(React.createElement(TikTokMetricsSummary, { t: english, result: { status } }));
    assert.match(html, explanation);
    assert.doesNotMatch(html, /<dt>/);
  }
});

test("TikTok metrics start collapsed with no automatic request or counts", async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  const { LanguageProvider } = await import("../components/LanguageProvider");
  const { TikTokPostMetricsPanel } = await import("../components/posts/TikTokPostMetricsPanel");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { assert.fail("collapsed panels must not query TikTok"); };
    const html = renderToStaticMarkup(React.createElement(LanguageProvider, null,
      React.createElement(TikTokPostMetricsPanel, { token: "test", workspaceId: "workspace", scheduleId: "schedule" })));
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /查看数据/);
    assert.doesNotMatch(html, /<dt>|video.list/);
  } finally { globalThis.fetch = originalFetch; }
});
