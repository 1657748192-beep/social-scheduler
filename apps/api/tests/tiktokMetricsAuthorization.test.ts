import assert from "node:assert/strict";
import test from "node:test";
import { validateTikTokMetricsGrant } from "../src/integrations/oauth/tiktokMetricsAuthorization";

test("optional analytics authorization preserves previously granted publishing scopes", () => {
  assert.throws(() => validateTikTokMetricsGrant("user.info.basic,video.list", ["user.info.basic", "video.publish"]), /publishing permissions/);
  assert.throws(() => validateTikTokMetricsGrant("user.info.basic,video.list,video.publish", ["video.upload"]), /publishing permissions/);
  assert.deepEqual(validateTikTokMetricsGrant("user.info.basic,video.publish,video.list", ["video.publish"]), ["user.info.basic", "video.publish", "video.list"]);
});

test("denying analytics still permits publishing, but missing grant metadata is never assumed", () => {
  assert.deepEqual(validateTikTokMetricsGrant("user.info.basic,video.publish", ["video.publish"]), ["user.info.basic", "video.publish"]);
  assert.throws(() => validateTikTokMetricsGrant(undefined, ["video.publish"]), /granted permissions/);
  assert.throws(() => validateTikTokMetricsGrant("", []), /granted permissions/);
});
