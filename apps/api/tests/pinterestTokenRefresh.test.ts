import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPinterestApiFailure,
  exchangePinterestRefreshToken,
  requestPinterestApi,
  resolvePinterestAccessToken,
  shouldRefreshPinterestToken
} from "../src/integrations/social/pinterestPublishing";

test("refreshes through Pinterest OAuth and keeps the rotated refresh token", async () => {
  let receivedUrl = "";
  let receivedAuthorization = "";
  let receivedBody = "";
  const fetcher: typeof fetch = async (input, init) => {
    receivedUrl = String(input);
    receivedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
    receivedBody = String(init?.body);
    return Response.json({
      access_token: "pina-new",
      refresh_token: "pinr-new",
      expires_in: 2592000,
      refresh_token_expires_in: 5184000,
      scope: "boards:read pins:write"
    });
  };

  const result = await exchangePinterestRefreshToken({
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    clientId: "app-id",
    clientSecret: "app-secret",
    refreshToken: "pinr-old",
    fetcher
  });

  assert.equal(receivedUrl, "https://api.pinterest.com/v5/oauth/token");
  assert.equal(receivedAuthorization, `Basic ${Buffer.from("app-id:app-secret").toString("base64")}`);
  assert.equal(new URLSearchParams(receivedBody).get("grant_type"), "refresh_token");
  assert.equal(new URLSearchParams(receivedBody).get("refresh_token"), "pinr-old");
  assert.deepEqual(result, {
    kind: "success",
    accessToken: "pina-new",
    refreshToken: "pinr-new",
    expiresIn: 2592000,
    scopes: ["boards:read", "pins:write"]
  });
});

test("invalid refresh grant requires reconnection but server errors remain retryable", async () => {
  const common = {
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    clientId: "app-id",
    clientSecret: "app-secret",
    refreshToken: "pinr-old"
  };
  const invalid = await exchangePinterestRefreshToken({
    ...common,
    fetcher: async () => Response.json({ error: "invalid_grant" }, { status: 400 })
  });
  const temporary = await exchangePinterestRefreshToken({
    ...common,
    fetcher: async () => Response.json({ message: "Unavailable" }, { status: 503 })
  });

  assert.deepEqual(invalid, { kind: "authorization_invalid" });
  assert.deepEqual(temporary, { kind: "temporary_failure", message: "Pinterest token refresh failed (503)." });
});

test("refreshes access tokens before expiry and leaves fresh credentials alone", () => {
  const now = Date.parse("2026-09-24T00:00:00.000Z");
  assert.equal(shouldRefreshPinterestToken(new Date(now + 12 * 60 * 60 * 1000), now), true);
  assert.equal(shouldRefreshPinterestToken(new Date(now + 2 * 24 * 60 * 60 * 1000), now), false);
});

test("distinguishes invalid authorization, missing permission, and temporary API failures", () => {
  assert.equal(classifyPinterestApiFailure(401, { code: 2 }), "authorization_invalid");
  assert.equal(classifyPinterestApiFailure(403, { message: "Missing pins:write scope" }), "permission_missing");
  assert.equal(classifyPinterestApiFailure(403, { message: "Board is private" }), "request_failed");
  assert.equal(classifyPinterestApiFailure(503, { message: "Service unavailable" }), "temporary_failure");
});

test("rotates and persists both Pinterest tokens before returning a publishable token", async () => {
  const now = Date.parse("2026-09-24T00:00:00.000Z");
  let saved: unknown = null;
  let status = "active";
  const result = await resolvePinterestAccessToken({
    accountId: "account-1",
    requiredScope: "pins:write",
    now,
    withLock: async (_accountId, work) => work({
      credential: {
        accessToken: "pina-old",
        refreshToken: "pinr-old",
        expiresAt: new Date(now + 60 * 60 * 1000),
        scopes: ["pins:write", "boards:read"]
      },
      save: async (value) => { saved = value; },
      setStatus: async (value) => { status = value; }
    }),
    exchange: async () => ({
      kind: "success",
      accessToken: "pina-new",
      refreshToken: "pinr-new",
      expiresIn: 2592000,
      scopes: ["pins:write", "boards:read"]
    })
  });

  assert.deepEqual(result, { kind: "success", accessToken: "pina-new" });
  assert.deepEqual(saved, {
    accessToken: "pina-new",
    refreshToken: "pinr-new",
    expiresAt: new Date(now + 2592000 * 1000),
    scopes: ["pins:write", "boards:read"]
  });
  assert.equal(status, "active");
});

test("missing Pinterest scope is marked separately from an invalid grant", async () => {
  const statuses: string[] = [];
  const base = {
    accountId: "account-1",
    withLock: async (_accountId: string, work: any) => work({
      credential: {
        accessToken: "pina-old",
        refreshToken: "pinr-old",
        expiresAt: new Date(Date.now() + 10_000_000),
        scopes: ["boards:read"]
      },
      save: async () => {},
      setStatus: async (value: string) => { statuses.push(value); }
    }),
    exchange: async () => ({ kind: "authorization_invalid" as const })
  };
  const missing = await resolvePinterestAccessToken({ ...base, requiredScope: "pins:write" });
  const invalid = await resolvePinterestAccessToken({ ...base, force: true });

  assert.deepEqual(missing, { kind: "permission_missing" });
  assert.deepEqual(invalid, { kind: "authorization_invalid" });
  assert.deepEqual(statuses, ["permission_missing", "authorization_invalid"]);
});

test("temporary Pinterest refresh failures leave the connection active", async () => {
  let statusWrites = 0;
  const result = await resolvePinterestAccessToken({
    accountId: "account-1",
    force: true,
    withLock: async (_accountId, work) => work({
      credential: {
        accessToken: "pina-old",
        refreshToken: "pinr-old",
        expiresAt: new Date(Date.now() + 10_000_000),
        scopes: ["boards:read"]
      },
      save: async () => {},
      setStatus: async () => { statusWrites += 1; }
    }),
    exchange: async () => ({ kind: "temporary_failure", message: "Pinterest token refresh failed (503)." })
  });

  assert.deepEqual(result, { kind: "temporary_failure", message: "Pinterest token refresh failed (503)." });
  assert.equal(statusWrites, 0);
});

test("a missing saved Pinterest credential requires reconnection", async () => {
  let marked = "";
  const result = await resolvePinterestAccessToken({
    accountId: "account-1",
    withLock: async (_accountId, work) => work({
      credential: null,
      save: async () => {},
      setStatus: async (status) => { marked = status; }
    }),
    exchange: async () => ({ kind: "temporary_failure", message: "unused" })
  });

  assert.deepEqual(result, { kind: "authorization_invalid" });
  assert.equal(marked, "authorization_invalid");
});

test("retries a Pinterest API request once with a refreshed token after invalid-token 401", async () => {
  const seenTokens: string[] = [];
  const result = await requestPinterestApi<{ id: string }>({
    fallback: "Pinterest request failed",
    getToken: async (force) => force ? "pina-new" : "pina-old",
    send: async (token) => {
      seenTokens.push(token);
      return token === "pina-old"
        ? Response.json({ code: 2, message: "Authentication failed" }, { status: 401 })
        : Response.json({ id: "pin-123" });
    },
    setStatus: async () => { throw new Error("should remain active"); }
  });

  assert.deepEqual(seenTokens, ["pina-old", "pina-new"]);
  assert.deepEqual(result, { id: "pin-123" });
});

test("marks an explicit Pinterest scope error but leaves a temporary API error connected", async () => {
  const marked: string[] = [];
  const base = {
    fallback: "Pinterest request failed",
    getToken: async () => "pina-current",
    setStatus: async (status: string) => { marked.push(status); }
  };

  await assert.rejects(
    requestPinterestApi({
      ...base,
      send: async () => Response.json({ message: "Missing pins:write scope" }, { status: 403 })
    }),
    /Missing pins:write scope/
  );
  await assert.rejects(
    requestPinterestApi({
      ...base,
      send: async () => Response.json({ message: "Unavailable" }, { status: 503 })
    }),
    /Unavailable/
  );
  assert.deepEqual(marked, ["permission_missing"]);
});
