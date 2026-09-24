import { config } from "../../config";
import { prisma } from "../../prisma";
import { decryptToken } from "../../utils/tokenCrypto";
import { checkFacebookPageCredential } from "./facebookPageValidation";

export { classifyFacebookPageFailure, normalizeFacebookPageExpiry } from "./facebookPageValidation";

export async function markFacebookPageAccountStatus(
  accountId: string,
  status: "authorization_invalid" | "permission_missing",
  usedAccessToken: string
) {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
  if (!account?.credential || account.platform !== "facebook" || account.accountType !== "page" || account.status !== "active") return;
  if (decryptToken(account.credential.accessTokenEncrypted) !== usedAccessToken) return;
  await prisma.socialAccount.updateMany({
    where: {
      id: accountId,
      platform: "facebook",
      status: "active",
      credential: { is: { accessTokenEncrypted: account.credential.accessTokenEncrypted } }
    },
    data: { status }
  });
}

export async function getFacebookPageAccessToken(accountId: string): Promise<string> {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
  if (!account?.credential || account.platform !== "facebook" || account.accountType !== "page" || account.status !== "active") {
    throw new Error("Facebook Page authorization is unavailable. Reconnect the Page before publishing.");
  }
  if (!config.FACEBOOK_CLIENT_ID || !config.FACEBOOK_CLIENT_SECRET) {
    throw new Error("Facebook Page authorization check is not configured.");
  }
  const credential = account.credential;
  const pageToken = decryptToken(credential.accessTokenEncrypted);
  const result = await checkFacebookPageCredential({
    pageId: account.providerAccountId,
    pageToken,
    appId: config.FACEBOOK_CLIENT_ID,
    appSecret: config.FACEBOOK_CLIENT_SECRET
  });
  if (result.kind === "authorization_invalid" || result.kind === "permission_missing") {
    await markFacebookPageAccountStatus(accountId, result.kind, pageToken);
    throw new Error(result.kind === "authorization_invalid"
      ? "Facebook Page authorization is invalid. Reconnect the Page before publishing."
      : "Facebook Page publishing permission is missing. Reconnect and approve the Page permissions.");
  }
  if (result.kind === "temporary_failure") throw new Error(result.message);
  await prisma.oauthCredential.updateMany({
    where: { id: credential.id, accessTokenEncrypted: credential.accessTokenEncrypted },
    data: { expiresAt: result.expiresAt }
  });
  return pageToken;
}

export async function checkDueFacebookPages() {
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: "facebook", accountType: "page", status: "active" },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 100
  });
  for (const account of accounts) {
    try {
      await getFacebookPageAccessToken(account.id);
    } catch (error) {
      console.error(`Facebook Page authorization check failed for account ${account.id}`, error instanceof Error ? error.message : "unknown error");
    }
  }
  return accounts.length;
}
