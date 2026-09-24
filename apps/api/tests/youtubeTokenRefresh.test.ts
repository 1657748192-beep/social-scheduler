import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyYouTubeFailure,
  refreshYouTubeToken,
  resolveYouTubeAccessToken,
  shouldMarkYouTubeAuthFailure
} from "../src/integrations/social/youtubeTokenRefresh";

test("separates invalid grant, permission errors, and temporary Google failures", () => {
  assert.equal(classifyYouTubeFailure(400, "invalid_grant"), "authorization_invalid");
  assert.equal(classifyYouTubeFailure(403, "insufficientPermissions"), "permission_missing");
  assert.equal(classifyYouTubeFailure(429), "temporary_failure");
  assert.equal(classifyYouTubeFailure(503), "temporary_failure");
  assert.equal(classifyYouTubeFailure(403, "quotaExceeded"), "request_failed");
  assert.equal(classifyYouTubeFailure(401), "request_failed");
  assert.equal(classifyYouTubeFailure(401, "invalid_client"), "request_failed");
});

test("refreshes through Google and validates the reported lifetime", async () => {
  let sentBody = "";
  const fetcher: typeof fetch = async (_url, init) => {
    sentBody = String(init?.body);
    return Response.json({ access_token: "youtube-new", expires_in: 3600, token_type: "Bearer" });
  };
  assert.deepEqual(await refreshYouTubeToken({
    refreshToken: "youtube-old-refresh", clientId: "client", clientSecret: "secret", fetcher
  }), { kind: "success", accessToken: "youtube-new", expiresIn: 3600, refreshToken: undefined, refreshExpiresIn: undefined });
  assert.equal(new URLSearchParams(sentBody).get("grant_type"), "refresh_token");
  assert.equal(new URLSearchParams(sentBody).get("refresh_token"), "youtube-old-refresh");
  assert.deepEqual(await refreshYouTubeToken({
    refreshToken: "r", clientId: "c", clientSecret: "s",
    fetcher: async () => Response.json({ access_token: "bad", expires_in: 0 })
  }), { kind: "temporary_failure", message: "YouTube token refresh returned incomplete credentials." });
});

test("invalid grant requires reconnection; timeout does not revoke authorization", async () => {
  assert.deepEqual(await refreshYouTubeToken({
    refreshToken: "r", clientId: "c", clientSecret: "s",
    fetcher: async () => Response.json({ error: "invalid_grant" }, { status: 400 })
  }), { kind: "authorization_invalid" });
  const timeout = await refreshYouTubeToken({
    refreshToken: "r", clientId: "c", clientSecret: "s",
    fetcher: async () => { throw new Error("network down"); }
  });
  assert.equal(timeout.kind, "temporary_failure");
  const misconfiguredClient = await refreshYouTubeToken({
    refreshToken: "r", clientId: "c", clientSecret: "s",
    fetcher: async () => Response.json({ error: "invalid_client" }, { status: 401 })
  });
  assert.equal(misconfiguredClient.kind, "temporary_failure");
});

test("resolver refreshes unknown expiry and preserves active status on temporary failures", async () => {
  const saved: string[] = [];
  const statuses: string[] = [];
  const result = await resolveYouTubeAccessToken({
    credential: { accessToken: "old", refreshToken: "refresh", expiresAt: null, scopes: ["youtube.upload"] },
    now: 1000,
    save: async (update) => { saved.push(update.accessToken); },
    setStatus: async (status) => { statuses.push(status); },
    refresh: async () => ({ kind: "success", accessToken: "new", expiresIn: 3600 })
  });
  assert.deepEqual(result, { kind: "success", accessToken: "new" });
  assert.deepEqual(saved, ["new"]);
  assert.deepEqual(statuses, []);

  const transient = await resolveYouTubeAccessToken({
    credential: { accessToken: "old", refreshToken: "refresh", expiresAt: new Date(2000), scopes: [] },
    now: 1000,
    save: async () => { throw new Error("must not save"); },
    setStatus: async (status) => { statuses.push(status); },
    refresh: async () => ({ kind: "temporary_failure", message: "offline" })
  });
  assert.deepEqual(transient, { kind: "success", accessToken: "old" });
  assert.deepEqual(statuses, []);
});

test("missing refresh token and upload scope get distinct states", async () => {
  const statuses: string[] = [];
  const base = {
    now: 1000,
    save: async () => {},
    setStatus: async (status: string) => { statuses.push(status); },
    refresh: async () => ({ kind: "temporary_failure" as const, message: "offline" })
  };
  const missing = await resolveYouTubeAccessToken({
    ...base, credential: { accessToken: "old", refreshToken: null, expiresAt: new Date(500), scopes: [] }
  });
  assert.deepEqual(missing, { kind: "authorization_invalid" });
  const scope = await resolveYouTubeAccessToken({
    ...base, requiredScope: "youtube.upload",
    credential: { accessToken: "old", refreshToken: "refresh", expiresAt: new Date(9999999), scopes: [] }
  });
  assert.deepEqual(scope, { kind: "permission_missing" });
  assert.deepEqual(statuses, ["authorization_invalid", "permission_missing"]);
});

test("an older token cannot invalidate a newly reconnected channel", () => {
  assert.equal(shouldMarkYouTubeAuthFailure("new", "old"), false);
  assert.equal(shouldMarkYouTubeAuthFailure("old", "old"), true);
});

test("a rotated Google refresh token without a stated deadline clears the old deadline", async () => {
  let saved: { refreshToken?: string; refreshTokenExpiresAt?: Date | null } | undefined;
  await resolveYouTubeAccessToken({
    credential: {
      accessToken: "old", refreshToken: "old-refresh", expiresAt: new Date(500),
      refreshTokenExpiresAt: new Date(100000), scopes: []
    },
    now: 1000,
    save: async (update) => { saved = update; },
    setStatus: async () => {},
    refresh: async () => ({ kind: "success", accessToken: "new", expiresIn: 3600, refreshToken: "new-refresh" })
  });
  assert.equal(saved?.refreshToken, "new-refresh");
  assert.equal(saved?.refreshTokenExpiresAt, null);
});

test("background YouTube checks renew within their wider safety window", async () => {
  let refreshCalls = 0;
  const base = {
    credential: { accessToken: "old", refreshToken: "refresh", expiresAt: new Date(1_000 + 20 * 60_000), scopes: [] },
    now: 1_000,
    save: async () => {}, setStatus: async () => {},
    refresh: async () => { refreshCalls += 1; return { kind: "success" as const, accessToken: "new", expiresIn: 3600 }; }
  };
  assert.deepEqual(await resolveYouTubeAccessToken(base), { kind: "success", accessToken: "old" });
  assert.deepEqual(await resolveYouTubeAccessToken({ ...base, refreshWithinMs: 40 * 60_000 }), { kind: "success", accessToken: "new" });
  assert.equal(refreshCalls, 1);
});
