import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardOverviewView } from "../components/dashboard/DashboardActivity";
import type { DashboardOverview } from "../lib/api";

const data: DashboardOverview = { publishedCount: 124, pendingCount: 9, draftCount: 103, connectedCount: 4, fetchedAt: "2026-10-07T00:00:00Z", upcoming: [{ id: "s", scheduledAt: "2026-10-08T03:00:00Z", status: "locked", platform: "instagram", title: "Actual title", text: "Actual caption", accountName: "real-account", thumbnailUrl: null }] };
const render = (value: DashboardOverview | null, loading = false, failed = false, locale: "zh-CN" | "en" = "en") => renderToStaticMarkup(React.createElement(DashboardOverviewView, { data: value, loading, failed, locale, timezone: "Asia/Shanghai" }));

test("overview renders real counts and schedule status with existing management links", () => {
  const html = render(data);
  for (const value of [">124<", ">103<", "Actual title", "Actual caption", "real-account", "Publishing", "Instagram", "11:00", 'href="/calendar"', 'href="/posts"', 'href="/drafts"']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes("20%"));
  assert.ok(html.includes("dashboard-thumbnail-placeholder"));
  assert.ok(html.includes('alt="Instagram"'));
});
test("loading and failed reads never display invented zeros or successful empty state", () => {
  for (const html of [render(null, true), render(null, false, true)]) {
    assert.ok(!html.includes(">0<"));
    assert.ok(!html.includes("No pending publications"));
  }
  assert.ok(render(null, true).includes("Loading"));
  assert.ok(render(null, false, true).includes('role="alert"'));
});

test("failed background updates retain the previous overview and explain automatic retry", () => {
  const html = render(data, false, true);
  assert.ok(html.includes("Actual title"));
  assert.ok(html.includes(">124<"));
  assert.ok(html.includes("Retrying automatically"));
});
test("a genuine empty result keeps zero counts and explains the current workspace scope", () => {
  const html = render({ ...data, publishedCount: 0, pendingCount: 0, draftCount: 0, connectedCount: 0, upcoming: [] }, false, false, "zh-CN");
  assert.ok(html.includes(">0<"));
  assert.ok(html.includes("暂无待发布内容"));
  assert.ok(html.includes("当前工作区"));
  assert.ok(html.includes("我的草稿"));
});
