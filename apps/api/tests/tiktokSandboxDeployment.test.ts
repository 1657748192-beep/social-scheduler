import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("server compose delivers isolated sandbox configuration only to API", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const settings = {
    TIKTOK_SANDBOX_ENABLED: "true", TIKTOK_SANDBOX_CLIENT_ID: "sandbox-test-key",
    TIKTOK_SANDBOX_CLIENT_SECRET: "sandbox-test-secret", TIKTOK_SANDBOX_ALLOWED_USER_ID: "test-user",
    TIKTOK_SANDBOX_WORKSPACE_ID: "test-workspace", TIKTOK_SANDBOX_SOCIAL_ACCOUNT_ID: "test-account"
  };
  const run = (env: Record<string, string>) => JSON.parse(execFileSync("docker", ["compose", "--env-file", ".env.example", "-f", "docker-compose.yml", "-f", "docker-compose.server.yml", "config", "--format", "json"],
    { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const configured = run(settings);
  for (const [key, value] of Object.entries(settings)) {
    assert.equal(configured.services.api.environment[key], value, `API must receive ${key}`);
    assert.equal(configured.services.worker.environment[key], undefined);
    assert.equal(configured.services.web.environment[key], undefined);
  }
  const defaults = run(Object.fromEntries(Object.keys(settings).map(key => [key, ""])));
  assert.equal(defaults.services.api.environment.TIKTOK_SANDBOX_ENABLED, "false");
});
