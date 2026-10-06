import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TikTokAccountStatsSummary, TikTokAccountStatsPanel } from "../components/channels/TikTokAccountStatsPanel";

test("account stats shows four account-level counts, not video metrics", () => {
  const html = renderToStaticMarkup(React.createElement(TikTokAccountStatsSummary, { t: (_zh, en) => en, result: { status: "ok", followerCount: 12, followingCount: 0, likesCount: 123, videoCount: 4, fetchedAt: "2026-10-06T00:00:00Z" } }));
  for (const label of ["Followers", "Following", "Total likes", "Public videos", "123", "12", ">0<"]) assert.ok(html.includes(label));
});
test("missing permission provides localized instructions and no invented zero counts", () => {
  for (const english of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(TikTokAccountStatsSummary, { t: (zh, en) => english ? en : zh, result: { status: "permission_missing" } }));
    assert.match(html, /user.info.stats/);
    assert.doesNotMatch(html, /<dt>/);
    assert.match(html, english ? /publishing/ : /发布/);
  }
});
test("account data starts collapsed and does not fetch on initial render", async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  const { LanguageProvider } = await import("../components/LanguageProvider");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { assert.fail("must be user initiated"); };
    const html = renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(TikTokAccountStatsPanel, { token: "test", workspaceId: "w", accountId: "a" })));
    assert.match(html, /查看账号数据/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /<dt>/);
  } finally { globalThis.fetch = original; }
});
