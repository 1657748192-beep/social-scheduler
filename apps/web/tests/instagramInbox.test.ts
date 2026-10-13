import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync(new URL("../components/inbox/InstagramInbox.tsx", import.meta.url), "utf8");

test("old inbox bookmarks redirect to the dashboard without opening conversations", async () => {
  const { default: InboxPage } = await import('../app/inbox/page');
  assert.throws(() => InboxPage(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { digest: string }).digest, 'NEXT_REDIRECT;replace;/dashboard;307;');
    return true;
  });
});

test("inbox supports manual refresh and replies while viewers and missing permissions remain read-only", () => {
  assert.match(inbox, /刷新|Refresh/);
  assert.match(inbox, /instagram\/conversations\/.*replies/);
  assert.match(inbox, /isViewer/);
  assert.match(inbox, /instagram_business_manage_messages/);
  assert.match(inbox, /Meta 回调及应用发布状态尚未验证/);
  assert.match(inbox, /24 小时|24-hour/);
  assert.doesNotMatch(inbox, /localStorage\.(?:setItem|getItem)[\s\S]*?(?:comment|message)/i);
});

test("all inbox labels are localized in Chinese and English", () => {
  assert.match(inbox, /t\("Instagram 收件箱", "Instagram inbox"\)/);
  assert.match(inbox, /t\("回复", "Reply"\)/);
  assert.match(inbox, /t\("发送", "Send"\)/);
});
