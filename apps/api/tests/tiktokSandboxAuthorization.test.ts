import assert from "node:assert/strict";
import test from "node:test";
import { createTikTokSandboxAPI, validateSandboxGrant, validateSandboxIdentity, sandboxAuthorizationUrl } from "../src/integrations/oauth/tiktokSandboxOAuth";
import { safeRequestLogUrl } from "../src/utils/requestLog";
test("OAuth callback codes and state never enter access log URL", () => {
  assert.equal(safeRequestLogUrl("/api/v1/integrations/tiktok-sandbox/oauth/callback?code=secret&state=nonce"), "/api/v1/integrations/tiktok-sandbox/oauth/callback");
  assert.equal(safeRequestLogUrl("/api/v1/health"), "/api/v1/health");
});
const scopes = "user.info.basic,video.list,user.info.stats";
test("sandbox authorization only asks for the three read scopes", () => {
  const url = new URL(sandboxAuthorizationUrl("sandbox", "https://example.com/callback", "nonce"));
  assert.equal(url.origin, "https://www.tiktok.com"); assert.equal(url.searchParams.get("scope"), scopes);
  assert.equal(url.searchParams.get("state"), "nonce"); assert.equal(url.searchParams.get("client_key"), "sandbox");
});
test("identity uses union identity, never display name or cross-client open id", () => {
  assert.doesNotThrow(() => validateSandboxIdentity({ openId: "sandbox-id", unionId: "same" }, "same", "sandbox-id"));
  for (const identity of [{ openId: "sandbox-id", unionId: "wrong" }, { openId: "sandbox-id", unionId: "" }, { openId: "wrong", unionId: "same" }]) {
    assert.throws(() => validateSandboxIdentity(identity, "same", "sandbox-id"));
  }
});
test("missing actual grants never assumed from requested scopes", () => {
  for (const value of [undefined, "", "video.list,user.info.stats", "user.info.basic,video.list", "user.info.basic,user.info.stats"]) assert.throws(() => validateSandboxGrant(value));
  assert.deepEqual(validateSandboxGrant(scopes), ["user.info.basic", "video.list", "user.info.stats"]);
});
test("identity response must have both identifiers and successful provider status", async () => {
  for (const data of [{ data: { user: { open_id: "a" } }, error: { code: "ok" } }, { data: { user: { open_id: "a", union_id: "b" } }, error: { code: "bad" } }]) {
    const api = createTikTokSandboxAPI(async () => new Response(JSON.stringify(data)));
    await assert.rejects(api.identity("secret"));
  }
});
test("API exchanges sandbox key only and strips provider secrets from errors", async () => {
  const api = createTikTokSandboxAPI(async (url, init) => {
    assert.equal(String(url), "https://open.tiktokapis.com/v2/oauth/token/");
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("client_key"), "sandbox-key"); assert.equal(body.get("client_secret"), "sandbox-secret");
    assert.equal(body.get("grant_type"), "authorization_code");
    return new Response(JSON.stringify({ error: "bad", error_description: "leaked-secret" }), { status: 400 });
  });
  await assert.rejects(api.exchange("sandbox-key", "sandbox-secret", { code: "code", redirectUri: "https://example.com/callback" }), e => {
    assert.ok(!String(e).includes("leaked-secret")); return true;
  });
});
