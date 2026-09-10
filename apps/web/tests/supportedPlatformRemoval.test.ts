import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { composerPlatforms } from "../components/composer/platformConfig";
import * as platformCounts from "../lib/platformCounts";

test("composer only offers platforms that are still supported", () => {
  assert.deepEqual(
    composerPlatforms.map((platform) => platform.platform),
    ["instagram", "facebook", "youtube", "tiktok", "pinterest"]
  );
});

test("sidebar ignores retired platforms when reporting connected platform count", async () => {
  const countConnectedSupportedPlatforms = platformCounts.countConnectedSupportedPlatforms as
    | ((
        accounts: Array<{ platform: string; status: string }>,
        supportedPlatforms: string[]
      ) => number)
    | undefined;

  assert.equal(
    countConnectedSupportedPlatforms?.(
      [
        { platform: "facebook", status: "active" },
        { platform: "facebook", status: "active" },
        { platform: "instagram", status: "active" },
        { platform: "linkedin", status: "active" },
        { platform: "x", status: "active" },
        { platform: "pinterest", status: "token_expired" }
      ],
      ["instagram", "facebook", "youtube", "tiktok", "pinterest"]
    ),
    2
  );
});

test("channel management hides retired OAuth providers", () => {
  const filterSupportedPlatforms = platformCounts.filterSupportedPlatforms as
    | ((providers: Array<{ platform: string }>) => Array<{ platform: string }>)
    | undefined;
  const dashboard = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

  assert.deepEqual(
    filterSupportedPlatforms?.([
      { platform: "instagram" },
      { platform: "linkedin" },
      { platform: "facebook" },
      { platform: "x" },
      { platform: "pinterest" }
    ]).map((provider) => provider.platform),
    ["instagram", "facebook", "pinterest"]
  );
  assert.match(dashboard, /filterSupportedPlatforms\(oauthStatuses\)/);
});

test("local and server deployment configuration omit retired platform credentials", () => {
  const envExample = readFileSync(".env.example", "utf8");
  const localCompose = readFileSync("docker-compose.yml", "utf8");
  const serverCompose = readFileSync("docker-compose.server.yml", "utf8");

  for (const config of [envExample, localCompose, serverCompose]) {
    assert.doesNotMatch(config, /LINKEDIN_CLIENT_(ID|SECRET)/);
    assert.doesNotMatch(config, /X_CLIENT_(ID|SECRET)/);
  }
});
