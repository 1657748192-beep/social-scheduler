import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/utils/errors";
import {
  classifyInstagramApiFailure,
  exchangeInstagramLongLivedToken,
  refreshInstagramToken,
  resolveInstagramAccessToken,
  shouldMarkInstagramAuthFailure,
  shouldRefreshInstagramToken
} from "../src/integrations/social/instagramTokenRefresh";

test("classifies Instagram token and permission errors without flagging server errors", () => {
  assert.equal(classifyInstagramApiFailure(400, { code: 190 }), "authorization_invalid");
  assert.equal(classifyInstagramApiFailure(403, { code: 200 }), "permission_missing");
  assert.equal(classifyInstagramApiFailure(503, { code: 190 }), "temporary_failure");
  assert.equal(classifyInstagramApiFailure(400, { code: 100 }), "request_failed");
});

test("an old publishing token cannot invalidate a newly reconnected account", () => {
  assert.equal(shouldMarkInstagramAuthFailure("new-token", "old-token"), false);
  assert.equal(shouldMarkInstagramAuthFailure("old-token", "old-token"), true);
});

test("exchanges an Instagram short-lived token for a long-lived token", async () => {
  let requested = "";
  const result = await exchangeInstagramLongLivedToken({
    shortLivedToken: "short-token",
    clientSecret: "secret",
    fetcher: async (url) => {
      requested = String(url);
      return Response.json({ access_token: "long-token", token_type: "bearer", expires_in: 5184000 });
    }
  });
  const url = new URL(requested);
  assert.equal(url.origin + url.pathname, "https://graph.instagram.com/access_token");
  assert.equal(url.searchParams.get("grant_type"), "ig_exchange_token");
  assert.equal(url.searchParams.get("access_token"), "short-token");
  assert.deepEqual(result, { access_token: "long-token", token_type: "bearer", expires_in: 5184000 });
});

test("failed long-lived exchange rejects instead of saving a short-lived token", async () => {
  await assert.rejects(
    exchangeInstagramLongLivedToken({
      shortLivedToken: "short-token",
      clientSecret: "secret",
      fetcher: async () => Response.json({ error: { code: 190 } }, { status: 400 })
    }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 400 &&
      /long-lived token exchange failed/i.test(error.message)
  );
});

test("exchange rejects a token whose reported lifetime is still short", async () => {
  await assert.rejects(
    exchangeInstagramLongLivedToken({
      shortLivedToken: "short-token",
      clientSecret: "secret",
      fetcher: async () => Response.json({ access_token: "still-short", expires_in: 3600 })
    }),
    /long-lived token exchange failed/i
  );
});

test("exchange rejects a nonnumeric lifetime", async () => {
  await assert.rejects(
    exchangeInstagramLongLivedToken({
      shortLivedToken: "short-token",
      clientSecret: "secret",
      fetcher: async () => Response.json({ access_token: "long-token", expires_in: "5184000" })
    }),
    /long-lived token exchange failed/i
  );
});

test("refreshes an unexpired Instagram token in the last seven days", async () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  assert.equal(shouldRefreshInstagramToken(new Date(now + 6 * 86400000), now), true);
  assert.equal(shouldRefreshInstagramToken(new Date(now + 8 * 86400000), now), false);
  assert.equal(shouldRefreshInstagramToken(new Date(now - 1), now), false);
  let requested = "";
  const result = await refreshInstagramToken({
    accessToken: "old-token",
    fetcher: async (url) => {
      requested = String(url);
      return Response.json({ access_token: "new-token", token_type: "bearer", expires_in: 5184000 });
    }
  });
  const url = new URL(requested);
  assert.equal(url.origin + url.pathname, "https://graph.instagram.com/refresh_access_token");
  assert.equal(url.searchParams.get("grant_type"), "ig_refresh_token");
  assert.equal(result.kind, "success");
});

test("refresh distinguishes revoked authorization from temporary failure", async () => {
  const revoked = await refreshInstagramToken({
    accessToken: "old-token",
    fetcher: async () => Response.json({ error: { code: 190, message: "Invalid token" } }, { status: 400 })
  });
  const temporary = await refreshInstagramToken({
    accessToken: "old-token",
    fetcher: async () => Response.json({ error: { code: 4, message: "Try later" } }, { status: 503 })
  });
  assert.deepEqual(revoked, { kind: "authorization_invalid" });
  assert.deepEqual(temporary, { kind: "temporary_failure", message: "Instagram token refresh failed (503)." });
});

test("refresh treats network errors as temporary rather than revoked authorization", async () => {
  const result = await refreshInstagramToken({
    accessToken: "old-token",
    fetcher: async () => { throw new Error("network down"); }
  });
  assert.deepEqual(result, { kind: "temporary_failure", message: "Instagram token refresh could not reach Meta." });
});

test("refresh rejects an implausibly short token lifetime", async () => {
  const result = await refreshInstagramToken({
    accessToken: "old-token",
    fetcher: async () => Response.json({ access_token: "new-token", expires_in: 60 })
  });
  assert.deepEqual(result, { kind: "temporary_failure", message: "Instagram token refresh returned incomplete credentials." });
});

test("resolver saves renewed token and leaves transient failures active", async () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  let saved: unknown;
  const statuses: string[] = [];
  const base = {
    now,
    requiredScope: "instagram_business_content_publish",
    credential: {
      accessToken: "old-token",
      expiresAt: new Date(now + 2 * 86400000),
      scopes: ["instagram_business_basic", "instagram_business_content_publish"]
    },
    save: async (update: unknown) => { saved = update; },
    setStatus: async (status: string) => { statuses.push(status); }
  };
  const success = await resolveInstagramAccessToken({
    ...base,
    refresh: async () => ({ kind: "success" as const, accessToken: "new-token", expiresIn: 5184000 })
  });
  assert.deepEqual(success, { kind: "success", accessToken: "new-token" });
  assert.deepEqual(saved, { accessToken: "new-token", expiresAt: new Date(now + 5184000 * 1000) });

  const temporary = await resolveInstagramAccessToken({
    ...base,
    refresh: async () => ({ kind: "temporary_failure" as const, message: "Try later" })
  });
  assert.deepEqual(temporary, { kind: "success", accessToken: "old-token" });
  assert.deepEqual(statuses, []);
});

test("resolver separates missing permission and expired authorization", async () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  const statuses: string[] = [];
  const base = {
    now,
    credential: { accessToken: "old-token", expiresAt: new Date(now + 86400000), scopes: ["instagram_business_basic"] },
    save: async () => {},
    setStatus: async (status: string) => { statuses.push(status); },
    refresh: async () => ({ kind: "authorization_invalid" as const })
  };
  const missing = await resolveInstagramAccessToken({ ...base, requiredScope: "instagram_business_content_publish" });
  const revoked = await resolveInstagramAccessToken(base);
  const expired = await resolveInstagramAccessToken({ ...base, credential: { ...base.credential, expiresAt: new Date(now - 1) } });
  assert.deepEqual(missing, { kind: "permission_missing" });
  assert.deepEqual(revoked, { kind: "authorization_invalid" });
  assert.deepEqual(expired, { kind: "token_expired" });
  assert.deepEqual(statuses, ["permission_missing", "authorization_invalid", "token_expired"]);
});
