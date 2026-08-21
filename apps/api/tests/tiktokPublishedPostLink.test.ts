import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { tiktokProfilePermalink, tiktokPublicPostPermalink } from "../src/integrations/social/tiktokPublisher";

test("creates a TikTok post permalink only when TikTok returns a public post ID", () => {
  assert.equal(
    tiktokPublicPostPermalink("mooyamcosmetic", ["7523456789012345678"]),
    "https://www.tiktok.com/@mooyamcosmetic/video/7523456789012345678"
  );
  assert.equal(tiktokPublicPostPermalink("mooyamcosmetic", []), undefined);
});

test("uses the creator username for a safe TikTok profile fallback", () => {
  assert.equal(tiktokProfilePermalink("@mooyamcosmetic"), "https://www.tiktok.com/@mooyamcosmetic");
  assert.equal(tiktokProfilePermalink("   "), undefined);
});

test("passes the TikTok profile fallback through to both publishing history views", () => {
  const scheduleService = readFileSync("src/services/scheduleService.ts", "utf8");
  const calendarDetail = readFileSync("../../apps/web/components/calendar/ScheduleDetailPanel.tsx", "utf8");
  const postManager = readFileSync("../../apps/web/components/posts/PublishedPostManager.tsx", "utf8");

  assert.match(scheduleService, /providerProfilePermalink/);
  assert.match(calendarDetail, /providerProfilePermalink/);
  assert.match(postManager, /providerProfilePermalink/);
});
