import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const manager = readFileSync(new URL("../components/posts/PublishedPostManager.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("published-post interaction UI is limited to Social Scheduler's own Instagram publication records", () => {
  assert.match(manager, /post\.platform\s*===\s*"instagram"/);
  assert.match(manager, /post\.providerPostId/);
  assert.match(manager, /instagram\/posts/);
  assert.doesNotMatch(manager, /facebook.*comments|comments.*facebook/i);
});

test("post interaction UI loads on expansion, paginates, refreshes, and requires explicit manual sends", () => {
  assert.match(manager, /查看互动|View activity/);
  assert.match(manager, /postPath}\/metrics/);
  assert.match(manager, /postPath}\/comments/);
  assert.match(manager, /private-replies/);
  assert.match(manager, /window\.confirm/);
  assert.match(manager, /nextCursor/);
  assert.match(manager, /onClick=[\s\S]*(?:send|reply)|onClick=/);
  assert.doesNotMatch(manager, /localStorage\.(?:setItem|getItem)[\s\S]*?(?:comment|message)/i);
  assert.match(manager, /需要重新授权|Reauthorize/);
  assert.match(manager, /Webhook.*(?:未配置|not configured)/i);
  assert.match(manager, /24 小时|24-hour/);
});

test("Instagram recovery UI avoids inert reauthorization and offers verified legacy linking only to managers", () => {
  assert.match(manager, /accountLinkState/);
  assert.match(manager, /recover-account/);
  assert.match(manager, /socialAccountId: selectedRecoveryAccount/);
  assert.match(manager, /此历史帖子尚未关联 Instagram 账号|This legacy post is not linked/);
  assert.match(manager, /原 Instagram 账号当前未连接|The original Instagram account is not connected/);
  assert.match(manager, /canReauthorize && post\.socialAccount\?\.id/);
});

test("published-post API types expose scoped engagement capability metadata without leaking scope arrays", () => {
  assert.match(types, /instagramEngagement\??:/);
  assert.match(types, /replyToComments/);
  assert.match(types, /privateReply/);
  assert.match(types, /providerPostId\??:/);
});

test("Instagram interaction panel starts collapsed and does not fetch or render private comment data until opened", async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  const { LanguageProvider } = await import("../components/LanguageProvider");
  const { InstagramPostEngagementPanel } = await import("../components/posts/PublishedPostManager");
  const html = renderToStaticMarkup(
    React.createElement(LanguageProvider, null,
      React.createElement(InstagramPostEngagementPanel, {
        token: "test-token",
        workspaceId: "workspace-1",
        role: "viewer",
        post: {
          id: "schedule-1",
          postId: "post-1",
          baseText: "Published text",
          scheduledAt: "2026-10-01T00:00:00Z",
          publishedAt: "2026-10-01T00:00:00Z",
          platform: "instagram",
          text: "Published text",
          providerPostId: "provider-media-1",
          instagramEngagement: {
            accountLinkState: "connected",
            readPostActivity: true,
            readComments: true,
            replyToComments: true,
            privateReply: true,
            inbox: true,
            webhookConfigured: true
          },
          media: []
        }
      })
    )
  );
  assert.match(html, /查看互动/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Published comment body|private reply/);
});

test("disconnected snapshot state remains collapsed and has reconnect guidance without a dead reauthorization button", async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  const { LanguageProvider } = await import("../components/LanguageProvider");
  const { InstagramPostEngagementPanel } = await import("../components/posts/PublishedPostManager");
  const html = renderToStaticMarkup(React.createElement(LanguageProvider, null,
    React.createElement(InstagramPostEngagementPanel, {
      token: "test-token", workspaceId: "workspace-1", role: "admin",
      post: {
        id: "schedule-2", postId: "post-2", baseText: "Text", scheduledAt: "2026-10-01T00:00:00Z",
        publishedAt: "2026-10-01T00:00:00Z", platform: "instagram", text: "Text", providerPostId: "media-2",
        instagramEngagement: { accountLinkState: "reconnect", readPostActivity: false, readComments: false,
          replyToComments: false, privateReply: false, inbox: false, webhookConfigured: false }, media: []
      }
    })
  ));
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Reauthorize Instagram/);
  assert.match(manager, /permissions\?\.accountLinkState === "reconnect" && !post\.socialAccount\?\.id/);
  assert.match(manager, /The original Instagram account is not connected/);
});
