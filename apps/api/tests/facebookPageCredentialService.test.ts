import assert from "node:assert/strict";
import test from "node:test";
import {
  checkFacebookPageCredential,
  classifyFacebookPageFailure,
  normalizeFacebookPageExpiry
} from "../src/integrations/social/facebookPageValidation";

test("Page expiry uses Meta's Page deadline, not the user's deadline", () => {
  assert.equal(normalizeFacebookPageExpiry(0), null);
  assert.equal(normalizeFacebookPageExpiry(undefined), null);
  assert.equal(normalizeFacebookPageExpiry(2_000_000_000)?.toISOString(), "2033-05-18T03:33:20.000Z");
});

test("Graph errors distinguish authorization, permission, and temporary failures", () => {
  assert.equal(classifyFacebookPageFailure(400, 190), "authorization_invalid");
  assert.equal(classifyFacebookPageFailure(403, 200), "permission_missing");
  assert.equal(classifyFacebookPageFailure(403, 10), "permission_missing");
  assert.equal(classifyFacebookPageFailure(503, 190), "temporary_failure");
  assert.equal(classifyFacebookPageFailure(429), "temporary_failure");
});

test("a valid Page token and selected Page identity passes with no invented expiry", async () => {
  let calls = 0;
  const result = await checkFacebookPageCredential({
    pageId: "123", pageToken: "page-token", appId: "app", appSecret: "secret",
    fetcher: async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ data: { app_id: "app", type: "PAGE", is_valid: true, expires_at: 0, scopes: ["pages_manage_posts", "pages_read_engagement"] } })
        : Response.json({ id: "123" });
    }
  });
  assert.deepEqual(result, { kind: "success", expiresAt: null });
  assert.equal(calls, 2);
});

test("rejects a Page identity mismatch and revoked Page role", async () => {
  let calls = 0;
  const base = { pageId: "123", pageToken: "page-token", appId: "app", appSecret: "secret" };
  const mismatch = await checkFacebookPageCredential({ ...base, fetcher: async () => {
    calls += 1;
    return calls === 1
      ? Response.json({ data: { app_id: "app", type: "PAGE", is_valid: true, scopes: ["pages_manage_posts", "pages_read_engagement"] } })
      : Response.json({ id: "456" });
  } });
  assert.deepEqual(mismatch, { kind: "authorization_invalid" });
  calls = 0;
  const revokedRole = await checkFacebookPageCredential({ ...base, fetcher: async () => {
    calls += 1;
    return calls === 1
      ? Response.json({ data: { app_id: "app", type: "PAGE", is_valid: true, scopes: ["pages_manage_posts", "pages_read_engagement"] } })
      : Response.json({ error: { code: 200 } }, { status: 403 });
  } });
  assert.deepEqual(revokedRole, { kind: "permission_missing" });
});

test("permission target and transient Meta errors do not masquerade as expiry", async () => {
  const base = { pageId: "123", pageToken: "page-token", appId: "app", appSecret: "secret" };
  const wrongPage = await checkFacebookPageCredential({ ...base, fetcher: async () => Response.json({ data: {
    app_id: "app", type: "PAGE", is_valid: true,
    scopes: ["pages_manage_posts", "pages_read_engagement"],
    granular_scopes: [{ scope: "pages_manage_posts", target_ids: ["456"] }]
  } }) });
  assert.deepEqual(wrongPage, { kind: "permission_missing" });
  const outage = await checkFacebookPageCredential({ ...base, fetcher: async () => Response.json({ error: { code: 190 } }, { status: 503 }) });
  assert.equal(outage.kind, "temporary_failure");
});

test("an incomplete successful debugger response preserves the existing connection", async () => {
  const base = { pageId: "123", pageToken: "page-token", appId: "app", appSecret: "secret" };
  for (const data of [
    { type: "PAGE", app_id: "app", scopes: ["pages_manage_posts", "pages_read_engagement"] },
    { is_valid: true, app_id: "app", scopes: ["pages_manage_posts", "pages_read_engagement"] },
    { is_valid: true, type: "PAGE", scopes: ["pages_manage_posts", "pages_read_engagement"] },
    { is_valid: true, type: "PAGE", app_id: "app" }
  ]) {
    const result = await checkFacebookPageCredential({ ...base, fetcher: async () => Response.json({ data }) });
    assert.equal(result.kind, "temporary_failure");
  }
});
