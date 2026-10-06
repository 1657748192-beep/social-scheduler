import { randomUUID } from "node:crypto";
import { assertSandboxContext, sandboxLock, sandboxTransactionOptions, type SandboxDependencies } from "../../services/tiktokSandboxAuthorizationService";
import { validateSandboxGrant } from "../oauth/tiktokSandboxOAuth";
import { decryptToken, encryptToken } from "../../utils/tokenCrypto";
import { HttpError } from "../../utils/errors";

export function createSandboxCredentialService({ db, settings, api }: SandboxDependencies) {
  return {
    async status(userId: string, workspaceId: string) {
      try {
        return await db.$transaction(async tx => {
          await assertSandboxContext(tx, settings, userId, workspaceId);
          const row = await tx.tikTokSandboxCredential.findUnique({ where: { socialAccountId: settings.allowedAccountId } });
          const connected = !!row && row.userId === userId && row.workspaceId === workspaceId && row.clientKey === settings.clientId;
          return { eligible: true, connected, accountName: "andypeng97" };
        });
      } catch (error) {
        if (error instanceof HttpError && error.statusCode === 403) return { eligible: false, connected: false };
        throw error;
      }
    },
    async token(userId: string, workspaceId: string) {
      return db.$transaction(async tx => {
        await sandboxLock(tx, settings.allowedAccountId);
        await assertSandboxContext(tx, settings, userId, workspaceId);
        let row = await tx.tikTokSandboxCredential.findUnique({ where: { socialAccountId: settings.allowedAccountId } });
        if (!row || row.userId !== userId || row.workspaceId !== workspaceId || row.clientKey !== settings.clientId) throw new HttpError(400, "Sandbox authorization required");
        validateSandboxGrant(row.scopes.join(","));
        if (row.expiresAt.getTime() <= Date.now() + 60000) {
          if (!row.refreshTokenEncrypted || !row.refreshTokenExpiresAt || row.refreshTokenExpiresAt.getTime() <= Date.now()) throw new HttpError(400, "Sandbox authorization required");
          const next = await api.refresh(settings.clientId, settings.clientSecret, decryptToken(row.refreshTokenEncrypted));
          validateSandboxGrant(next.scopes.join(","));
          if (next.openId !== row.openId) throw new HttpError(400, "Sandbox account identity does not match");
          await assertSandboxContext(tx, settings, userId, workspaceId);
          const updated = await tx.tikTokSandboxCredential.updateMany({ where: { id: row.id, revision: row.revision }, data: {
            accessTokenEncrypted: encryptToken(next.accessToken), refreshTokenEncrypted: next.refreshToken ? encryptToken(next.refreshToken) : row.refreshTokenEncrypted,
            expiresAt: new Date(Date.now() + next.expiresIn * 1000),
            refreshTokenExpiresAt: next.refreshExpiresIn ? new Date(Date.now() + next.refreshExpiresIn * 1000) : row.refreshTokenExpiresAt,
            scopes: next.scopes, revision: randomUUID()
          } });
          if (updated.count !== 1) throw new HttpError(400, "Sandbox connection changed; retry authorization");
          row = await tx.tikTokSandboxCredential.findUniqueOrThrow({ where: { id: row.id } });
        }
        return { accessToken: decryptToken(row.accessTokenEncrypted), openId: row.openId };
      }, sandboxTransactionOptions);
    },
    async disconnect(userId: string, workspaceId: string) {
      await db.$transaction(async tx => {
        await sandboxLock(tx, settings.allowedAccountId);
        await assertSandboxContext(tx, settings, userId, workspaceId);
        await tx.tikTokSandboxOAuthState.deleteMany({ where: { socialAccountId: settings.allowedAccountId } });
        await tx.tikTokSandboxCredential.deleteMany({ where: { socialAccountId: settings.allowedAccountId, userId, workspaceId } });
      }, sandboxTransactionOptions);
    }
  };
}
