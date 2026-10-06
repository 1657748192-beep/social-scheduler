import assert from "node:assert/strict";
import test from "node:test";
import { sandboxVideoId } from "../src/services/tiktokSandboxMetricsService";
const post = { id: "p", workspaceId: "w", status: "published", postVariant: { platform: "tiktok", socialAccountId: "a" },
  publishJobs: [{ status: "succeeded", providerPostId: "123456789012345", rawResponse: { tiktokAccountId: "prod", privacyLevel: "PUBLIC_TO_EVERYONE" } }] };
test("only the specified account's real public published post is accepted", () => {
  assert.equal(sandboxVideoId(post, "w", "a", "prod"), "123456789012345");
  for (const bad of [null, { ...post, workspaceId: "other" }, { ...post, status: "failed" }, { ...post, postVariant: { platform: "tiktok", socialAccountId: "other" } },
    { ...post, publishJobs: [{ ...post.publishJobs[0], providerPostId: "publish-task-id" }] },
    ...[{ simulated: true }, { tiktokAccountId: "other" }, { privacyLevel: "SELF_ONLY" }].map(rawResponse => ({ ...post, publishJobs: [{ ...post.publishJobs[0], rawResponse }] }))]) {
    assert.throws(() => sandboxVideoId(bad, "w", "a", "prod"));
  }
});
