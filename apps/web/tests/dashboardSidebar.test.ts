import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardSidebar } from "../components/dashboard/DashboardSidebar";
import type { SocialAccount } from "../lib/api";

const accounts: SocialAccount[] = [
  { id: "a", platform: "instagram", providerAccountId: "private-id", displayName: "Owned account", status: "active", capabilities: {}, createdAt: "2026-10-07" },
  { id: "b", platform: "tiktok", providerAccountId: "other-private-id", displayName: "Expired account", status: "token_expired", capabilities: {}, createdAt: "2026-10-07" }
];

test("dashboard account overview distinguishes active and expired accounts without exposing provider identifiers", () => {
  const html = renderToStaticMarkup(React.createElement(DashboardSidebar, { accounts, locale: "en", loading: false }));
  assert.match(html, /Owned account/);
  assert.match(html, /Expired account/);
  assert.match(html, /Authorization expired/);
  assert.equal((html.match(/data-connected="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-connected="false"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /private-id/);
  for (const route of ["/composer", "/calendar", "/drafts", "/posts", "#social-channels"]) assert.ok(html.includes(`href="${route}"`));
});

test("dashboard loading does not pretend that an account list is empty and localized empty state creates no account rows", () => {
  const loading = renderToStaticMarkup(React.createElement(DashboardSidebar, { accounts: [], locale: "en", loading: true }));
  assert.match(loading, /Loading/);
  assert.doesNotMatch(loading, /No social accounts/);
  const empty = renderToStaticMarkup(React.createElement(DashboardSidebar, { accounts: [], locale: "zh-CN", loading: false }));
  assert.match(empty, /暂未绑定社交账号/);
  assert.doesNotMatch(empty, /data-connected=/);
  assert.match(empty, /查看日历/);
});

test("a failed overview read does not report a successful empty account list", () => {
  const html = renderToStaticMarkup(React.createElement(DashboardSidebar, { accounts: [], locale: "en", loading: false, failed: true }));
  assert.match(html, /Could not load accounts/);
  assert.doesNotMatch(html, /No social accounts/);
});
