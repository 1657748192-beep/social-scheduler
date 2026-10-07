import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardSidebar } from "../components/dashboard/DashboardSidebar";
import type { SocialAccount } from "../lib/api";

test("social accounts use identifiable local official logo images for all five platforms", () => {
  const platforms = ["instagram", "facebook", "youtube", "tiktok", "pinterest"];
  const accounts = platforms.map(platform => ({ id: platform, platform, displayName: `account-${platform}`, status: "active" })) as SocialAccount[];
  const html = renderToStaticMarkup(React.createElement(DashboardSidebar, { accounts, locale: "zh-CN", loading: false }));
  assert.equal((html.match(/<img /g) ?? []).length, 5);
  for (const platform of platforms) {
    assert.ok(html.includes(`/platform-logos/${platform}.`));
    assert.ok(html.includes(`account-${platform}`));
  }
  for (const name of ["Instagram", "Facebook", "YouTube", "TikTok", "Pinterest"]) assert.ok(html.includes(`alt="${name}"`));
});
