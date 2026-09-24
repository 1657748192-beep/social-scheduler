import { config } from "../../config";
import { prisma } from "../../prisma";
import { decryptToken, encryptToken } from "../../utils/tokenCrypto";
import { pinterestOAuthTokenUrl } from "./pinterestEnvironment";
import {
  exchangePinterestRefreshToken,
  resolvePinterestAccessToken,
  type PinterestLockedCredential,
  type PinterestTokenResolution
} from "./pinterestPublishing";

const refreshWindowMs = 24 * 60 * 60 * 1000;

export async function markPinterestAccountStatus(
  accountId: string,
  status: "authorization_invalid" | "permission_missing"
) {
  await prisma.socialAccount.updateMany({
    where: { id: accountId, platform: "pinterest", status: "active" },
    data: { status }
  });
}

export async function getPinterestAccountAccessToken(
  accountId: string,
  requiredScope?: string,
  force = false
) {
  const result = await resolvePinterestAccessToken({
    accountId,
    requiredScope,
    force,
    withLock: (id, work) =>
      prisma.$transaction(
        async (tx): Promise<PinterestTokenResolution> => {
          // Serialize refreshes across the API and worker, including OAuth reconnections.
          await tx.$queryRaw`SELECT id FROM social_accounts WHERE id = ${id}::uuid FOR UPDATE`;
          const account = await tx.socialAccount.findUnique({
            where: { id },
            include: { credential: true }
          });
          if (
            !account ||
            account.platform !== "pinterest" ||
            (account.status !== "active" && account.status !== "token_expired")
          ) {
            return { kind: "authorization_invalid" };
          }

          const credential = account.credential;
          const locked: PinterestLockedCredential = {
            credential: credential
              ? {
                  accessToken: decryptToken(credential.accessTokenEncrypted),
                  refreshToken: credential.refreshTokenEncrypted
                    ? decryptToken(credential.refreshTokenEncrypted)
                    : null,
                  expiresAt: credential.expiresAt,
                  scopes: credential.scopes
                }
              : null,
            save: async (update) => {
              if (!credential) return;
              await tx.oauthCredential.update({
                where: { id: credential.id },
                data: {
                  accessTokenEncrypted: encryptToken(update.accessToken),
                  refreshTokenEncrypted: encryptToken(update.refreshToken),
                  expiresAt: update.expiresAt,
                  scopes: update.scopes
                }
              });
              if (account.status === "token_expired") {
                await tx.socialAccount.update({ where: { id }, data: { status: "active" } });
              }
            },
            setStatus: async (status) => {
              await tx.socialAccount.update({ where: { id }, data: { status } });
            }
          };
          return work(locked);
        },
        { maxWait: 5000, timeout: 20000 }
      ),
    exchange: (refreshToken) =>
      exchangePinterestRefreshToken({
        tokenUrl: pinterestOAuthTokenUrl(config.PINTEREST_API_ENV),
        clientId: config.PINTEREST_CLIENT_ID,
        clientSecret: config.PINTEREST_CLIENT_SECRET,
        refreshToken
      })
  });

  if (result.kind === "success") return result.accessToken;
  if (result.kind === "permission_missing") {
    throw new Error(`Pinterest permission ${requiredScope ?? "required for this action"} is missing. Reconnect the account and approve it.`);
  }
  if (result.kind === "authorization_invalid") {
    throw new Error("Pinterest authorization is invalid. Reconnect the account before publishing.");
  }
  throw new Error(result.message);
}

export async function refreshDuePinterestAccounts() {
  const due = await prisma.socialAccount.findMany({
    where: {
      platform: "pinterest",
      status: { in: ["active", "token_expired"] },
      credential: { is: { expiresAt: { lte: new Date(Date.now() + refreshWindowMs) } } }
    },
    select: { id: true }
  });

  for (const account of due) {
    try {
      await getPinterestAccountAccessToken(account.id);
    } catch (error) {
      console.error(`Pinterest token refresh failed for account ${account.id}`, error);
    }
  }
  return due.length;
}
