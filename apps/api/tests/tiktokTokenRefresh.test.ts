import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTikTokTokenFailure,
  classifyTikTokApiFailure,
  refreshTikTokToken,
  resolveTikTokAccessToken,
  type TikTokLockedCredential
} from "../src/integrations/social/tiktokTokenRefresh";

test("classifies only definite invalid grants as revoked", () => {
  assert.equal(classifyTikTokTokenFailure(400, "invalid_grant"), "authorization_invalid");
  assert.equal(classifyTikTokTokenFailure(429, "rate_limit_exceeded"), "temporary_failure");
  assert.equal(classifyTikTokTokenFailure(503), "temporary_failure");
  assert.equal(classifyTikTokTokenFailure(400, "invalid_request"), "request_failed");
});

test("TikTok publish API separates OAuth scope from creator restrictions", () => {
  assert.equal(classifyTikTokApiFailure(401, "scope_not_authorized"), "permission_missing");
  assert.equal(classifyTikTokApiFailure(401, "access_token_invalid"), "request_failed");
  assert.equal(classifyTikTokApiFailure(429, "rate_limit_exceeded"), "temporary_failure");
  assert.equal(classifyTikTokApiFailure(403, "spam_risk_user_banned_from_posting"), "request_failed");
  assert.equal(classifyTikTokApiFailure(400, "privacy_level_option_mismatch"), "request_failed");
});

test("refresh saves TikTok's rotated token and reported deadlines", async () => {
  let sent = "";
  const result = await refreshTikTokToken({
    refreshToken: "old-refresh", clientKey: "key", clientSecret: "secret",
    fetcher: async (_url, init) => {
      sent = String(init?.body);
      return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 86400, refresh_expires_in: 31536000 });
    }
  });
  assert.deepEqual(result, { kind: "success", accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 86400, refreshExpiresIn: 31536000 });
  assert.equal(new URLSearchParams(sent).get("grant_type"), "refresh_token");
  assert.equal(new URLSearchParams(sent).get("refresh_token"), "old-refresh");
});

test("invalid grant differs from a temporary network failure", async () => {
  assert.deepEqual(await refreshTikTokToken({
    refreshToken: "r", clientKey: "k", clientSecret: "s",
    fetcher: async () => Response.json({ error: "invalid_grant" }, { status: 400 })
  }), { kind: "authorization_invalid" });
  const down = await refreshTikTokToken({
    refreshToken: "r", clientKey: "k", clientSecret: "s",
    fetcher: async () => { throw new Error("offline"); }
  });
  assert.equal(down.kind, "temporary_failure");
  const incomplete = await refreshTikTokToken({
    refreshToken: "r", clientKey: "k", clientSecret: "s",
    fetcher: async () => Response.json({ access_token: "a", expires_in: 0 })
  });
  assert.equal(incomplete.kind, "temporary_failure");
});

test("resolver updates both tokens and restores a falsely expired account", async () => {
  const saved: string[] = [];
  const statuses: string[] = [];
  const result = await resolveTikTokAccessToken({
    accountId: "account",
    now: 1000,
    withLock: async (_id, work) => work({
      status: "token_expired",
      credential: { accessToken: "old", refreshToken: "refresh", expiresAt: new Date(500), refreshTokenExpiresAt: null, scopes: ["video.publish"] },
      save: async (update) => { saved.push(`${update.accessToken}/${update.refreshToken}`); },
      setStatus: async (status) => { statuses.push(status); }
    }),
    exchange: async () => ({ kind: "success", accessToken: "new", refreshToken: "new-refresh", expiresIn: 86400, refreshExpiresIn: 31536000 })
  });
  assert.deepEqual(result, { kind: "success", accessToken: "new" });
  assert.deepEqual(saved, ["new/new-refresh"]);
  assert.deepEqual(statuses, ["active"]);
});

test("missing permission and known refresh expiry require separate action", async () => {
  const statuses: string[] = [];
  const locked: TikTokLockedCredential = {
    status: "active",
    credential: { accessToken: "old", refreshToken: "r", expiresAt: new Date(500), refreshTokenExpiresAt: new Date(900), scopes: [] },
    save: async () => { throw new Error("not expected"); },
    setStatus: async (status) => { statuses.push(status); }
  };
  const base = {
    accountId: "account", now: 1000,
    withLock: async (_id: string, work: (locked: TikTokLockedCredential) => Promise<unknown>) => work(locked),
    exchange: async () => { throw new Error("not expected"); }
  };
  assert.deepEqual(await resolveTikTokAccessToken({ ...base, requiredScope: "video.publish" }), { kind: "permission_missing" });
  assert.deepEqual(await resolveTikTokAccessToken(base), { kind: "token_expired" });
  assert.deepEqual(statuses, ["permission_missing", "token_expired"]);
});

test("background checks renew before expiry while publishing can use a valid token", async () => {
  let calls = 0;
  const base = {
    accountId: "account", now: 1000,
    withLock: async (_id: string, work: (locked: TikTokLockedCredential) => Promise<unknown>) => work({
      status: "active",
      credential: { accessToken: "old", refreshToken: "refresh", expiresAt: new Date(1000 + 2 * 60 * 60_000), refreshTokenExpiresAt: null, scopes: [] },
      save: async () => {}, setStatus: async () => {}
    }),
    exchange: async () => { calls += 1; return { kind: "success" as const, accessToken: "new", expiresIn: 86400 }; }
  };
  assert.deepEqual(await resolveTikTokAccessToken(base), { kind: "success", accessToken: "old" });
  assert.deepEqual(await resolveTikTokAccessToken({ ...base, refreshWithinMs: 8 * 60 * 60_000 }), { kind: "success", accessToken: "new" });
  assert.equal(calls, 1);
});

test("missing access expiry triggers renewal; missing refresh token requires reconnection", async () => {
  let refreshCalls = 0;
  const statuses: string[] = [];
  const withCredential = (refreshToken: string | null) => resolveTikTokAccessToken({
    accountId: "account", now: 1000,
    withLock: async (_id, work) => work({
      status: "active",
      credential: { accessToken: "old", refreshToken, expiresAt: null, refreshTokenExpiresAt: null, scopes: [] },
      save: async () => {}, setStatus: async (status) => { statuses.push(status); }
    }),
    exchange: async () => { refreshCalls += 1; return { kind: "success", accessToken: "new", expiresIn: 86400 }; }
  });
  assert.deepEqual(await withCredential("refresh"), { kind: "success", accessToken: "new" });
  assert.deepEqual(await withCredential(null), { kind: "authorization_invalid" });
  assert.equal(refreshCalls, 1);
  assert.deepEqual(statuses, ["authorization_invalid"]);
});

test("temporary renewal failures do not revoke an active account", async () => {
  const statuses: string[] = [];
  const result = await resolveTikTokAccessToken({
    accountId: "account", now: 1000, refreshWithinMs: 100_000,
    withLock: async (_id, work) => work({
      status: "active",
      credential: { accessToken: "old", refreshToken: "refresh", expiresAt: new Date(2000), refreshTokenExpiresAt: null, scopes: [] },
      save: async () => {}, setStatus: async (status) => { statuses.push(status); }
    }),
    exchange: async () => ({ kind: "temporary_failure", message: "offline" })
  });
  assert.deepEqual(result, { kind: "success", accessToken: "old" });
  assert.deepEqual(statuses, []);
});

test("serialized concurrent refresh calls use only the first old refresh token", async () => {
  let next = Promise.resolve();
  let accessToken = "old";
  let refreshToken = "old-refresh";
  let expiresAt = new Date(500);
  const used: string[] = [];
  const withLock = async (_id: string, work: (locked: TikTokLockedCredential) => Promise<unknown>) => {
    const previous = next;
    let release!: () => void;
    next = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await work({
        status: "active",
        credential: { accessToken, refreshToken, expiresAt, refreshTokenExpiresAt: null, scopes: [] },
        save: async (update) => {
          accessToken = update.accessToken;
          refreshToken = update.refreshToken ?? refreshToken;
          expiresAt = update.expiresAt;
        },
        setStatus: async () => {}
      });
    } finally { release(); }
  };
  const input = {
    accountId: "account", now: 1000, withLock,
    exchange: async (token: string) => {
      used.push(token);
      return { kind: "success" as const, accessToken: "new", refreshToken: "new-refresh", expiresIn: 86400 };
    }
  };
  const results = await Promise.all([resolveTikTokAccessToken(input), resolveTikTokAccessToken(input)]);
  assert.deepEqual(results, [{ kind: "success", accessToken: "new" }, { kind: "success", accessToken: "new" }]);
  assert.deepEqual(used, ["old-refresh"]);
});
