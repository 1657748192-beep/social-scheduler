import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  accountStatusLabel,
  invitationStatusLabel,
  memberStatusLabel,
  publishJobStatusLabel,
  roleLabel,
  scheduleStatusLabel
} from "../lib/labels";

test("shared status labels use English text in English mode", () => {
  assert.equal(roleLabel("owner", "en"), "Owner");
  assert.equal(roleLabel("admin", "en"), "Administrator");
  assert.equal(accountStatusLabel("active", "en"), "Connected");
  assert.equal(accountStatusLabel("token_expired", "en"), "Authorization expired");
  assert.equal(memberStatusLabel("disabled", "en"), "Disabled");
  assert.equal(invitationStatusLabel("accepted", "en"), "Accepted");
  assert.equal(scheduleStatusLabel("scheduled", "en"), "Scheduled");
  assert.equal(scheduleStatusLabel("published", "en"), "Published");
  assert.equal(scheduleStatusLabel("failed", "en"), "Publishing failed");
  assert.equal(publishJobStatusLabel("succeeded", "en"), "Succeeded");
  assert.equal(publishJobStatusLabel("dead", "en"), "Terminated");
});

test("shared status labels keep Chinese as the default and preserve unknown values", () => {
  assert.equal(scheduleStatusLabel("published"), "已发布");
  assert.equal(publishJobStatusLabel("succeeded"), "成功");
  assert.equal(scheduleStatusLabel("future-status", "en"), "future-status");
});

test("status consumers pass the active locale to shared label helpers", () => {
  const calendarDetail = readFileSync("apps/web/components/calendar/ScheduleDetailPanel.tsx", "utf8");
  const dashboard = readFileSync("apps/web/app/dashboard/page.tsx", "utf8");
  const invitation = readFileSync("apps/web/app/invitations/[token]/page.tsx", "utf8");

  assert.match(calendarDetail, /const \{ locale, t \} = useLanguage\(\)/);
  assert.match(calendarDetail, /scheduleStatusLabel\(schedule\.status, locale\)/);
  assert.match(calendarDetail, /publishJobStatusLabel\(latestJob\.status, locale\)/);
  assert.match(dashboard, /accountStatusLabel\(account\.status, locale\)/);
  assert.match(dashboard, /memberStatusLabel\(member\.status, locale\)/);
  assert.match(dashboard, /invitationStatusLabel\(invitation\.status, locale\)/);
  assert.match(invitation, /invitationStatusLabel\(invitation\.status, locale\)/);
});

test("publishing access states provide English labels in dashboard and admin views", () => {
  const dashboard = readFileSync("apps/web/app/dashboard/page.tsx", "utf8");
  const admin = readFileSync("apps/web/app/admin/page.tsx", "utf8");

  assert.match(dashboard, /t\("发布权限已停用", "Publishing access disabled"\)/);
  assert.match(dashboard, /t\("测试发布权限已到期", "Publishing access expired"\)/);
  assert.match(dashboard, /t\("截止：", "Ends: "\)/);
  assert.match(admin, /import \{ useLanguage \} from "\.\.\/\.\.\/components\/LanguageProvider"/);
  assert.match(admin, /t\("使用中", "Active"\)/);
  assert.match(admin, /accessStatusLabel\(user\.publishingAccessStatus, t\)/);
  assert.match(admin, /roleLabel\(workspace\.role, locale\)/);
  assert.match(admin, /memberStatusLabel\(workspace\.status, locale\)/);
  assert.match(admin, /accountStatusLabel\(account\.status, locale\)/);
});
