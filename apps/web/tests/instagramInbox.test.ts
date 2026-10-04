import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync(new URL("../components/inbox/InstagramInbox.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/inbox/page.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");

test("Instagram inbox is reachable from the application and loads workspace-scoped conversations", () => {
  assert.match(page, /InstagramInbox/);
  assert.match(shell, /href: "\/inbox"/);
  assert.match(inbox, /social-accounts/);
  assert.match(inbox, /instagram\/conversations/);
  assert.match(inbox, /\/messages/);
});

test("inbox supports manual refresh and replies while viewers and missing permissions remain read-only", () => {
  assert.match(inbox, /刷新|Refresh/);
  assert.match(inbox, /instagram\/conversations\/.*replies/);
  assert.match(inbox, /isViewer/);
  assert.match(inbox, /instagram_business_manage_messages/);
  assert.match(inbox, /Webhook.*(?:未配置|not configured)/i);
  assert.match(inbox, /24 小时|24-hour/);
  assert.doesNotMatch(inbox, /localStorage\.(?:setItem|getItem)[\s\S]*?(?:comment|message)/i);
});

test("all inbox labels are localized in Chinese and English", () => {
  assert.match(inbox, /t\("Instagram 收件箱", "Instagram inbox"\)/);
  assert.match(inbox, /t\("回复", "Reply"\)/);
  assert.match(inbox, /t\("发送", "Send"\)/);
});
