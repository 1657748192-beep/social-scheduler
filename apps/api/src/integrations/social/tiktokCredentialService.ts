import { config } from "../../config";
import { prisma } from "../../prisma";
import { decryptToken, encryptToken } from "../../utils/tokenCrypto";
import { refreshTikTokToken, resolveTikTokAccessToken } from "./tiktokTokenRefresh";
import { scanDueSocialAccountIds } from "./socialAccountBatch";

const refreshWindowMs = 8 * 60 * 60_000;

export async function markTikTokAccountStatus(
  accountId: string,
  status: "permission_missing" | "authorization_invalid",
  usedAccessToken: string
) {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
  if (!account?.credential || account.platform !== "tiktok" || !["active", "token_expired"].includes(account.status)) return;
  if (decryptToken(account.credential.accessTokenEncrypted) !== usedAccessToken) return;
  await prisma.socialAccount.updateMany({
    where: {
      id: accountId,
      platform: "tiktok",
      status: account.status,
      credential: { is: { accessTokenEncrypted: account.credential.accessTokenEncrypted } }
    },
    data: { status }
  });
}

export async function getTikTokAccountAccessToken(
  accountId: string,
  requiredScope?: string,
  refreshWithinMs?: number,
  rejectedAccessToken?: string
): Promise<string> {
  const result = await resolveTikTokAccessToken({
    accountId,
    requiredScope,
    refreshWithinMs,
    rejectedAccessToken,
    withLock: (id, work) => prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM social_accounts WHERE id = ${id}::uuid FOR UPDATE`;
      const account = await tx.socialAccount.findUnique({ where: { id }, include: { credential: true } });
      if (!account || account.platform !== "tiktok" || !["active", "token_expired"].includes(account.status)) {
        throw new Error("TikTok authorization is unavailable. Reconnect the account before publishing.");
      }
      const credential = account.credential;
      return work({
        status: account.status as "active" | "token_expired",
        credential: credential ? {
          accessToken: decryptToken(credential.accessTokenEncrypted),
          refreshToken: credential.refreshTokenEncrypted ? decryptToken(credential.refreshTokenEncrypted) : null,
          expiresAt: credential.expiresAt,
          refreshTokenExpiresAt: credential.refreshTokenExpiresAt,
          scopes: credential.scopes
        } : null,
        save: async (update) => {
          if (!credential) return;
          await tx.oauthCredential.update({ where: { id: credential.id }, data: {
            accessTokenEncrypted: encryptToken(update.accessToken),
            refreshTokenEncrypted: update.refreshToken
              ? encryptToken(update.refreshToken) : credential.refreshTokenEncrypted,
            expiresAt: update.expiresAt,
            refreshTokenExpiresAt: update.refreshTokenExpiresAt === undefined
              ? credential.refreshTokenExpiresAt : update.refreshTokenExpiresAt
          } });
        },
        setStatus: async (status) => {
          await tx.socialAccount.update({ where: { id }, data: { status } });
        }
      });
    }, { maxWait: 5000, timeout: 20000 }),
    exchange: (refreshToken) => refreshTikTokToken({
      refreshToken,
      clientKey: config.TIKTOK_CLIENT_ID,
      clientSecret: config.TIKTOK_CLIENT_SECRET
    })
  });

  if (result.kind === "success") return result.accessToken;
  if (result.kind === "permission_missing") {
    throw new Error("TikTok video publishing permission is missing. Reconnect and approve video.publish.");
  }
  if (result.kind === "token_expired") {
    throw new Error("TikTok renewal credential expired. Reconnect the account before publishing.");
  }
  if (result.kind === "authorization_invalid") {
    throw new Error("TikTok authorization is invalid. Reconnect the account before publishing.");
  }
  throw new Error(result.message);
}

export async function refreshDueTikTokAccounts() {
  const accountIds = await scanDueSocialAccountIds("tiktok", {
    platform: "tiktok",
    status: { in: ["active", "token_expired"] },
    OR: [
      { status: "token_expired" },
      { credential: { is: { OR: [
        { expiresAt: { lte: new Date(Date.now() + refreshWindowMs) } },
        { expiresAt: null }
      ] } } }
    ]
  });
  for (const accountId of accountIds) {
    try {
      await getTikTokAccountAccessToken(accountId, undefined, refreshWindowMs);
    } catch (error) {
      console.error(`TikTok token check failed for account ${accountId}`, error instanceof Error ? error.message : "unknown error");
    }
  }
  return accountIds.length;
}
