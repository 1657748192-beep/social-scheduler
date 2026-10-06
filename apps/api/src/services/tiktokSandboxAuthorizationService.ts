import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assertTikTokSandboxAccess } from "./tiktokSandboxPolicy";
import { createTikTokSandboxAPI, sandboxAuthorizationUrl, validateSandboxGrant, validateSandboxIdentity } from "../integrations/oauth/tiktokSandboxOAuth";
import { decryptToken, encryptToken } from "../utils/tokenCrypto";
import { HttpError } from "../utils/errors";

export type SandboxSettings = { enabled: boolean; allowedUserId: string; allowedWorkspaceId: string; allowedAccountId: string; clientId: string; clientSecret: string; redirectUri: string };
export type SandboxDependencies = { db: PrismaClient; settings: SandboxSettings; api: ReturnType<typeof createTikTokSandboxAPI> };
export type SandboxTx = Prisma.TransactionClient;
export async function sandboxLock(tx: SandboxTx, accountId: string) {
  // Separate advisory namespace, never lock the production social account row.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tiktok-sandbox:${accountId}`}, 0))`;
}
export async function assertSandboxContext(tx: SandboxTx, settings: SandboxSettings, userId: string, workspaceId: string) {
  // Cheap config check before database lookups; no information from other tenants is returned.
  assertTikTokSandboxAccess({ ...settings, userId, workspaceId, accountId: settings.allowedAccountId, memberStatus: "active", role: "owner" });
  const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  assertTikTokSandboxAccess({ ...settings, userId, workspaceId, accountId: settings.allowedAccountId, memberStatus: member?.status ?? "", role: member?.role ?? "" });
  const account = await tx.socialAccount.findFirst({ where: { id: settings.allowedAccountId, workspaceId, platform: "tiktok", status: { in: ["active", "token_expired"] } }, include: { credential: true } });
  if (!account?.credential) throw new HttpError(403, "The designated TikTok account is unavailable");
  return account;
}
async function assertSession(tx: SandboxTx, userId: string, sessionId: string) {
  const session = await tx.userSession.findFirst({ where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - 86400000) } } });
  if (!session) throw new HttpError(401, "Sign in and restart sandbox authorization");
}
export const sandboxTransactionOptions = { maxWait: 5000, timeout: 45000 };
export function createSandboxAuthorizationService({ db, settings, api }: SandboxDependencies) {
  return {
    async start(userId: string, workspaceId: string, sessionId: string) {
      return db.$transaction(async tx => {
        await sandboxLock(tx, settings.allowedAccountId);
        const account = await assertSandboxContext(tx, settings, userId, workspaceId);
        await assertSession(tx, userId, sessionId);
        const credential = account.credential!;
        if (!credential.scopes.includes("user.info.basic") || !credential.scopes.includes("video.publish") ||
            !credential.expiresAt || credential.expiresAt.getTime() <= Date.now()) {
          throw new HttpError(400, "Check the existing TikTok publishing connection before sandbox testing");
        }
        const accessToken = decryptToken(credential.accessTokenEncrypted);
        const username = await api.creator(accessToken);
        if (username !== "andypeng97") throw new HttpError(403, "Only andypeng97 can use this sandbox connection");
        const identity = await api.identity(accessToken);
        validateSandboxIdentity(identity, identity.unionId, account.providerAccountId);
        await assertSandboxContext(tx, settings, userId, workspaceId);
        await assertSession(tx, userId, sessionId);
        const state = randomBytes(32).toString("base64url");
        await tx.tikTokSandboxOAuthState.deleteMany({ where: { OR: [{ socialAccountId: account.id }, { expiresAt: { lte: new Date() } }] } });
        await tx.tikTokSandboxOAuthState.create({ data: { stateHash: createHash("sha256").update(state).digest("hex"),
          userId, workspaceId, socialAccountId: account.id, sessionId, clientKey: settings.clientId, expectedUnionId: identity.unionId,
          redirectUri: settings.redirectUri, expiresAt: new Date(Date.now() + 600000) } });
        return { authorizationUrl: sandboxAuthorizationUrl(settings.clientId, settings.redirectUri, state) };
      }, sandboxTransactionOptions);
    },
    async complete(input: { state: string; code?: string; error?: string }) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(input.state)) throw new HttpError(400, "Invalid sandbox authorization state");
      const stateHash = createHash("sha256").update(input.state).digest("hex");
      const failure = await db.$transaction(async tx => {
        // Always use the configured account; changing configuration invalidates all old callbacks.
        await sandboxLock(tx, settings.allowedAccountId);
        const state = await tx.tikTokSandboxOAuthState.findUnique({ where: { stateHash } });
        if (!state) return "Invalid or already used sandbox authorization state";
        await tx.tikTokSandboxOAuthState.delete({ where: { id: state.id } });
        // Catch provider/validation errors inside transaction so the state stays consumed.
        try {
          if (input.error || !input.code || input.code.length > 4096 || state.expiresAt.getTime() <= Date.now() ||
              state.clientKey !== settings.clientId || state.socialAccountId !== settings.allowedAccountId || state.redirectUri !== settings.redirectUri) throw new Error();
          await assertSandboxContext(tx, settings, state.userId, state.workspaceId);
          await assertSession(tx, state.userId, state.sessionId);
          const token = await api.exchange(settings.clientId, settings.clientSecret, { code: input.code, redirectUri: state.redirectUri });
          validateSandboxGrant(token.scopes.join(","));
          const identity = await api.identity(token.accessToken);
          validateSandboxIdentity(identity, state.expectedUnionId, token.openId);
          await assertSandboxContext(tx, settings, state.userId, state.workspaceId);
          await assertSession(tx, state.userId, state.sessionId);
          const data = { userId: state.userId, workspaceId: state.workspaceId, socialAccountId: state.socialAccountId,
            clientKey: settings.clientId, openId: identity.openId, unionId: identity.unionId,
            accessTokenEncrypted: encryptToken(token.accessToken), refreshTokenEncrypted: token.refreshToken ? encryptToken(token.refreshToken) : null,
            scopes: token.scopes, expiresAt: new Date(Date.now() + token.expiresIn * 1000),
            refreshTokenExpiresAt: token.refreshExpiresIn ? new Date(Date.now() + token.refreshExpiresIn * 1000) : null, revision: randomUUID() };
          await tx.tikTokSandboxCredential.upsert({ where: { socialAccountId: state.socialAccountId }, create: data, update: data });
          return null;
        } catch { return "Sandbox authorization failed. Check the selected account and permissions, then retry."; }
      }, sandboxTransactionOptions);
      if (failure) throw new HttpError(400, failure);
    }
  };
}
