import { config } from "../../config";
import { prisma } from "../../prisma";
import { decryptToken, encryptToken } from "../../utils/tokenCrypto";
import { refreshYouTubeToken, resolveYouTubeAccessToken } from "./youtubeTokenRefresh";

const refreshWindowMs = 40 * 60_000;

export async function markYouTubeAccountStatus(
  accountId: string,
  status: "authorization_invalid" | "permission_missing",
  usedAccessToken: string
) {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
  if (!account?.credential || account.platform !== "youtube" || account.status !== "active") return;
  if (decryptToken(account.credential.accessTokenEncrypted) !== usedAccessToken) return;
  await prisma.socialAccount.updateMany({
    where: {
      id: accountId,
      platform: "youtube",
      status: "active",
      credential: { is: { accessTokenEncrypted: account.credential.accessTokenEncrypted } }
    },
    data: { status }
  });
}

export async function getYouTubeAccountAccessToken(
  accountId: string,
  requiredScope?: string,
  refreshWithinMs?: number
): Promise<string> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM social_accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
    const account = await tx.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
    if (!account || account.platform !== "youtube" || account.status !== "active") {
      throw new Error("YouTube authorization is unavailable. Reconnect the channel before publishing.");
    }
    const credential = account.credential;
    return resolveYouTubeAccessToken({
      credential: credential ? {
        accessToken: decryptToken(credential.accessTokenEncrypted),
        refreshToken: credential.refreshTokenEncrypted ? decryptToken(credential.refreshTokenEncrypted) : null,
        expiresAt: credential.expiresAt,
        refreshTokenExpiresAt: credential.refreshTokenExpiresAt,
        scopes: credential.scopes
      } : null,
      requiredScope,
      refreshWithinMs,
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
        await tx.socialAccount.update({ where: { id: accountId }, data: { status } });
      },
      refresh: (refreshToken) => refreshYouTubeToken({
        refreshToken,
        clientId: config.YOUTUBE_CLIENT_ID,
        clientSecret: config.YOUTUBE_CLIENT_SECRET
      })
    });
  }, { maxWait: 5000, timeout: 20000 });

  if (result.kind === "success") return result.accessToken;
  if (result.kind === "permission_missing") {
    throw new Error("YouTube upload permission is missing. Reconnect and approve the requested permissions.");
  }
  if (result.kind === "token_expired") {
    throw new Error("YouTube renewal credential expired. Reconnect the channel before publishing.");
  }
  if (result.kind === "authorization_invalid") {
    throw new Error("YouTube authorization is invalid. Reconnect the channel before publishing.");
  }
  throw new Error(result.message);
}

export async function refreshDueYouTubeAccounts() {
  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: "youtube",
      status: "active",
      credential: { is: { OR: [
        { expiresAt: { lte: new Date(Date.now() + refreshWindowMs) } },
        { expiresAt: null }
      ] } }
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 100
  });
  for (const account of accounts) {
    try {
      await getYouTubeAccountAccessToken(account.id, undefined, refreshWindowMs);
    } catch (error) {
      console.error(`YouTube token check failed for account ${account.id}`, error instanceof Error ? error.message : "unknown error");
    }
  }
  return accounts.length;
}
