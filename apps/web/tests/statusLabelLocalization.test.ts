import assert from "node:assert/strict";
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
