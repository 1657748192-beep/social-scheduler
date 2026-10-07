import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as dashboard from "../components/dashboard/DashboardActivity";
import type { CalendarSchedule } from "../lib/api";

function schedule(id: string, platform = "instagram", text = "Same caption", time = "2026-10-07T05:00:00Z", assets = ["asset-a"], status = "scheduled") {
  return { id, workspaceId: "w", postVariantId: id, scheduledAt: time, timezone: "Asia/Shanghai", status,
    postVariant: { id, platform, text, publishStatus: status, post: { id: "post-a", title: "Real content", baseText: text, workflowStatus: "scheduled" }, socialAccount: { id: platform, displayName: platform + "-account", platform },
      media: assets.map((asset, sortOrder) => ({ id: asset + id, sortOrder, mediaAsset: { id: asset, mimeType: "image/jpeg", thumbnailUrl: "/thumb.jpg", fileUrl: "/image.jpg" } })) }, publishJobs: [] } as unknown as CalendarSchedule;
}
function render(schedules: CalendarSchedule[], tab = "upcoming") {
  const View = (dashboard as any).DashboardContentView;
  assert.equal(typeof View, "function", "dashboard content tabs must be implemented");
  return renderToStaticMarkup(React.createElement(View, { schedules, drafts: [], activeTab: tab, locale: "zh-CN", timezone: "Asia/Shanghai", loading: false, failed: false, month: "2026-10", onTabChange: () => {}, onMonthChange: () => {} }));
}
test("draft tab excludes expired drafts but keeps text-only unexpired drafts", () => {
  const View = (dashboard as any).DashboardContentView;
  const draft = { id: "draft-a", title: "Text draft", baseText: "Draft caption", workspaceId: "w", workflowStatus: "draft", createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z", variants: [], expiresAt: "2100-01-01T00:00:00Z" };
  const html = renderToStaticMarkup(React.createElement(View, { schedules: [], drafts: [draft, { ...draft, id: "expired", title: "Expired draft", expiresAt: "2000-01-01T00:00:00Z" }], activeTab: "drafts", locale: "zh-CN", timezone: "Asia/Shanghai", loading: false, failed: false, month: "2026-10", onTabChange: () => {}, onMonthChange: () => {} }));
  assert.ok(html.includes("Text draft"));
  assert.ok(!html.includes("Expired draft"));
  assert.ok(html.includes('href="/drafts"'));
});
test("same complete assets, caption and publish instant merge across platforms", () => {
  const html = render([schedule("a"), schedule("b", "youtube"), schedule("c", "tiktok", "Same caption", "2026-10-07T13:00:00+08:00", ["asset-a"], "locked")]);
  assert.equal((html.match(/<tr data-content-group=/g) ?? []).length, 1);
  for (const text of ["Instagram", "YouTube", "TikTok", "发布中", "已排程", "日历视图", "草稿", "已发布", "发布队列", "查看全部"]) assert.ok(html.includes(text), text);
});
test("different captions, times, ordered full asset lists and media-free posts stay separate", () => {
  const html = render([schedule("a"), schedule("b", "youtube", "Other caption"), schedule("c", "tiktok", "Same caption", "2026-10-07T06:00:00Z"), schedule("d", "facebook", "Same caption", undefined, ["asset-a", "asset-b"]), schedule("e", "youtube", "Same caption", undefined, ["asset-b", "asset-a"])]);
  assert.equal((html.match(/<tr data-content-group=/g) ?? []).length, 5);
});
test("grouping happens before the five-row preview limit and tabs filter statuses", () => {
  const rows = [schedule("a"), schedule("b", "youtube"), ...Array.from({ length: 5 }, (_, i) => schedule("s" + i, "tiktok", "Caption " + i)), schedule("done", "instagram", "Done", undefined, ["asset-a"], "published"), schedule("error", "youtube", "Failure", undefined, ["asset-a"], "failed")];
  const upcoming = render(rows);
  assert.equal((upcoming.match(/<tr data-content-group=/g) ?? []).length, 5);
  assert.ok(upcoming.includes("Caption 3"));
  assert.ok(!upcoming.includes("Done"));
  const published = render(rows, "published");
  assert.ok(published.includes("Done"));
  assert.ok(!published.includes("Failure"));
  assert.ok(published.includes('href="/posts"'));
  assert.ok(render(rows, "queue").includes("Failure"));
});
test("calendar groups rows by workspace-local date and keeps month navigation", () => {
  const html = render([schedule("a", "instagram", "Near midnight", "2026-09-30T16:30:00Z")], "calendar");
  assert.ok(html.includes("Near midnight"));
  assert.ok(html.includes('data-calendar-date="2026-10-01"'));
  assert.ok(html.includes("上个月"));
});
