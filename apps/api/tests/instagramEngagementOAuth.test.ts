import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildInstagramEngagementScopes,
  parseInstagramGrantedScopes,
  validateInstagramEngagementReauthorization
} from "../src/integrations/oauth/instagramEngagementOAuth";

test("engagement reauthorization adds only Instagram interaction scopes to existing scopes", () => {
  const providers = readFileSync(
    new URL("../src/integrations/oauth/oauthProviders.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    providers,
    /defaultScopes: configuredScopes\(config\.INSTAGRAM_OAUTH_SCOPES, \[\s*"instagram_business_basic",\s*"instagram_business_content_publish"\s*\]\)/
  );
  assert.deepEqual(
    buildInstagramEngagementScopes(["instagram_business_basic", "instagram_business_content_publish"]),
    [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages"
    ]
  );
  assert.deepEqual(
    buildInstagramEngagementScopes(["instagram_business_basic", "instagram_business_manage_comments"]),
    [
      "instagram_business_basic",
      "instagram_business_manage_comments",
      "instagram_business_content_publish",
      "instagram_business_manage_messages"
    ]
  );
  assert.equal(buildInstagramEngagementScopes(["public_profile"]).includes("pages_manage_posts"), false);
});

test("accepts reauthorization only for the same Instagram account and when prior publishing scopes remain", () => {
  const existingScopes = ["instagram_business_basic", "instagram_business_content_publish"];
  assert.deepEqual(
    validateInstagramEngagementReauthorization({
      expectedProviderAccountId: "ig-123",
      actualProviderAccountId: "ig-123",
      existingScopes,
      grantedScopes: [...existingScopes, "instagram_business_manage_comments"]
    }),
    { accepted: true, grantedScopes: [...existingScopes, "instagram_business_manage_comments"] }
  );

  assert.deepEqual(
    validateInstagramEngagementReauthorization({
      expectedProviderAccountId: "ig-123",
      actualProviderAccountId: "ig-other",
      existingScopes,
      grantedScopes: [...existingScopes, "instagram_business_manage_messages"]
    }),
    { accepted: false, reason: "account_mismatch" }
  );
  assert.deepEqual(
    validateInstagramEngagementReauthorization({
      expectedProviderAccountId: "ig-123",
      actualProviderAccountId: "ig-123",
      existingScopes,
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_comments"]
    }),
    { accepted: false, reason: "publishing_scope_missing" }
  );
});

test("reads Meta's actual granted Instagram permissions instead of assuming every requested scope was accepted", () => {
  assert.deepEqual(parseInstagramGrantedScopes({
    access_token: "short-token",
    permissions: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments"
  }), [
    "instagram_business_basic",
    "instagram_business_content_publish",
    "instagram_business_manage_comments"
  ]);
  assert.deepEqual(parseInstagramGrantedScopes({
    permissions: ["instagram_business_basic", "instagram_business_manage_messages"]
  }), ["instagram_business_basic", "instagram_business_manage_messages"]);
  assert.equal(parseInstagramGrantedScopes({ access_token: "token" }), null);
});

test("deployment preserves configured Instagram scopes and does not modify Facebook scopes", () => {
  const deploy = readFileSync(new URL("../../../scripts/deploy-server.sh", import.meta.url), "utf8");
  assert.match(deploy, /ensure_env_value INSTAGRAM_OAUTH_SCOPES/);
  assert.doesNotMatch(deploy, /force_env_value INSTAGRAM_OAUTH_SCOPES/);
  assert.match(
    deploy,
    /force_env_value FACEBOOK_OAUTH_SCOPES "public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata"/
  );
  assert.match(deploy, /ensure_env_value INSTAGRAM_GRAPH_API_VERSION/);
  assert.match(deploy, /ensure_env_value INSTAGRAM_WEBHOOK_VERIFY_TOKEN/);
});
