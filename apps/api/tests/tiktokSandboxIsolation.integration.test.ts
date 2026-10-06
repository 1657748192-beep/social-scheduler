import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { encryptToken, decryptToken } from "../src/utils/tokenCrypto";
import { createSandboxAuthorizationService } from "../src/services/tiktokSandboxAuthorizationService";
import { createSandboxCredentialService } from "../src/integrations/social/tiktokSandboxCredentialService";

test("Sandbox database isolation, replay protection and identity gating", async t => {
  const url = process.env.SANDBOX_TEST_DATABASE_URL;
  assert.ok(url, "SANDBOX_TEST_DATABASE_URL is required for integration tests");
  assert.match(new URL(url).pathname, /_test$/);
  assert.notEqual(url, process.env.DATABASE_URL, "Never run against production DATABASE_URL");
  const db = new PrismaClient({ datasources: { db: { url } } });
  const userId = randomUUID(), workspaceId = randomUUID(), accountId = randomUUID(), sessionId = randomUUID();
  const settings = { enabled: true, allowedUserId: userId, allowedWorkspaceId: workspaceId, allowedAccountId: accountId,
    clientId: "sandbox-client", clientSecret: "sandbox-secret", redirectUri: "https://example.com/api/v1/integrations/tiktok-sandbox/oauth/callback" };
  let username = "andypeng97", identityUnion = "same", exchanged = 0, refreshed = 0;
  const api = {
    creator: async () => username,
    identity: async (token: string) => ({ openId: token === "prod-token" ? "prod-open" : "sandbox-open", unionId: identityUnion }),
    exchange: async (key: string, secret: string) => { assert.equal(key, "sandbox-client"); assert.equal(secret, "sandbox-secret"); exchanged++; return {
      accessToken: "test-token", refreshToken: "test-refresh", openId: "sandbox-open", scopes: ["user.info.basic", "video.list", "user.info.stats"], expiresIn: 86400, refreshExpiresIn: 31536000 }; },
    refresh: async (key: string, secret: string, refreshToken: string) => {
      assert.equal(key, "sandbox-client"); assert.equal(secret, "sandbox-secret"); assert.equal(refreshToken, "test-refresh"); refreshed++;
      return { accessToken: "renewed", refreshToken: "rotated", openId: "sandbox-open", scopes: ["user.info.basic", "video.list", "user.info.stats"], expiresIn: 86400, refreshExpiresIn: 31536000 };
    }
  };
  const service = createSandboxAuthorizationService({ db, settings, api });
  try {
    await db.user.create({ data: { id: userId, email: `${userId}@example.test`, passwordHash: "not-a-password", name: "Tester" } });
    await db.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Test", slug: workspaceId } });
    await db.workspaceMember.create({ data: { userId, workspaceId, role: "owner", status: "active" } });
    await db.userSession.create({ data: { id: sessionId, userId, tokenId: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    await db.socialAccount.create({ data: { id: accountId, workspaceId, platform: "tiktok", providerAccountId: "prod-open", displayName: "Not used for identity", credential: { create: { accessTokenEncrypted: encryptToken("prod-token"), scopes: ["user.info.basic", "video.publish"], expiresAt: new Date(Date.now() + 3600000) } } } });
    const before = await db.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
    const start = async () => new URL((await service.start(userId, workspaceId, sessionId)).authorizationUrl).searchParams.get("state")!;
    await t.test("wrong username is rejected even for allowed user", async () => { username = "mooyamcosmetic"; await assert.rejects(start, (e: any) => e.statusCode === 403); username = "andypeng97"; });
    await t.test("wrong workspace never reaches provider", async () => { await assert.rejects(service.start(userId, randomUUID(), sessionId), (e: any) => e.statusCode === 403); });
    await t.test("concurrent callback consumes once and encrypts only sandbox storage", async () => {
      const state = await start(); const results = await Promise.allSettled([service.complete({ state, code: "code" }), service.complete({ state, code: "code" })]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(exchanged, 1);
      const row = await db.tikTokSandboxCredential.findUniqueOrThrow({ where: { socialAccountId: accountId } });
      assert.notEqual(row.accessTokenEncrypted, "test-token"); assert.equal(decryptToken(row.accessTokenEncrypted), "test-token");
      assert.equal(row.openId, "sandbox-open"); assert.equal(await db.tikTokSandboxOAuthState.count({ where: { socialAccountId: accountId } }), 0);
    });
    await t.test("wrong union callback preserves previous credential and cannot replay", async () => {
      const row = await db.tikTokSandboxCredential.findUniqueOrThrow({ where: { socialAccountId: accountId } });
      const state = await start(); identityUnion = "wrong"; await assert.rejects(service.complete({ state, code: "code" })); identityUnion = "same";
      await assert.rejects(service.complete({ state, code: "code" }));
      assert.deepEqual(await db.tikTokSandboxCredential.findUnique({ where: { socialAccountId: accountId } }), row);
    });
    await t.test("denied expired disabled and logged-out callbacks do not save", async () => {
      for (const mode of ["deny", "expired", "disabled", "logout", "role"]) {
        const state = await start();
        const row = await db.tikTokSandboxCredential.findUnique({ where: { socialAccountId: accountId } });
        if (mode === "expired") await db.tikTokSandboxOAuthState.updateMany({ where: { socialAccountId: accountId }, data: { expiresAt: new Date(0) } });
        if (mode === "disabled") settings.enabled = false;
        if (mode === "logout") await db.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
        if (mode === "role") await db.workspaceMember.updateMany({ where: { userId, workspaceId }, data: { role: "viewer" } });
        await assert.rejects(service.complete({ state, code: "code", error: mode === "deny" ? "access_denied" : undefined }));
        assert.deepEqual(await db.tikTokSandboxCredential.findUnique({ where: { socialAccountId: accountId } }), row);
        settings.enabled = true;
        await db.userSession.update({ where: { id: sessionId }, data: { revokedAt: null } });
        await db.workspaceMember.updateMany({ where: { userId, workspaceId }, data: { role: "owner" } });
      }
    });
    assert.deepEqual(await db.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } }), before);
    const credentials = createSandboxCredentialService({ db, settings, api });
    await t.test("parallel refresh rotates sandbox tokens only once", async () => {
      await db.tikTokSandboxCredential.update({ where: { socialAccountId: accountId }, data: { expiresAt: new Date(0) } });
      const tokens = await Promise.all([credentials.token(userId, workspaceId), credentials.token(userId, workspaceId)]);
      assert.equal(refreshed, 1); assert.deepEqual(tokens.map(v => v.accessToken), ["renewed", "renewed"]);
      assert.equal(decryptToken((await db.tikTokSandboxCredential.findUniqueOrThrow({ where: { socialAccountId: accountId } })).refreshTokenEncrypted!), "rotated");
    });
    await t.test("changed client or disabled feature rejects cached token", async () => {
      settings.clientId = "other"; await assert.rejects(credentials.token(userId, workspaceId)); settings.clientId = "sandbox-client";
      settings.enabled = false; await assert.rejects(credentials.token(userId, workspaceId)); settings.enabled = true;
    });
    await t.test("disconnect overlapping a blocked refresh leaves no resurrected credentials", async () => {
      await service.complete({ state: await start(), code: "code" });
      await db.tikTokSandboxCredential.update({ where: { socialAccountId: accountId }, data: { expiresAt: new Date(0) } });
      let entered!: () => void, release!: () => void;
      const entering = new Promise<void>(resolve => { entered = resolve; });
      const blocked = new Promise<void>(resolve => { release = resolve; });
      const original = api.refresh;
      api.refresh = async (...args) => { entered(); await blocked; return original(...args); };
      try {
        const refreshing = credentials.token(userId, workspaceId);
        await entering;
        const disconnecting = credentials.disconnect(userId, workspaceId);
        release();
        await Promise.all([refreshing, disconnecting]);
        assert.equal(await db.tikTokSandboxCredential.count({ where: { socialAccountId: accountId } }), 0);
        await assert.rejects(credentials.token(userId, workspaceId));
      } finally { release(); api.refresh = original; }
    });
    await t.test("disconnect invalidates pending callbacks and does not recreate credentials", async () => {
      const state = await start(); await credentials.disconnect(userId, workspaceId);
      await assert.rejects(service.complete({ state, code: "code" })); await assert.rejects(credentials.token(userId, workspaceId));
      assert.equal(await db.tikTokSandboxCredential.count({ where: { socialAccountId: accountId } }), 0);
    });
    assert.deepEqual(await db.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } }), before);
    assert.equal(await db.socialAccount.count({ where: { workspaceId } }), 1);
    assert.equal(await db.publishJob.count({ where: { workspaceId } }), 0);
  } finally { await db.workspace.deleteMany({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect(); }
});
