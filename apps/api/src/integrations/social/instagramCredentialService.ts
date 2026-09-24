import { prisma } from "../../prisma";
import { decryptToken, encryptToken } from "../../utils/tokenCrypto";
import {
  refreshInstagramToken,
  resolveInstagramAccessToken,
  shouldMarkInstagramAuthFailure,
  type InstagramTokenResolution
} from "./instagramTokenRefresh";

const refreshWindowMs = 7 * 86400000;

export async function markInstagramAccountStatus(
  accountId: string,
  status: "authorization_invalid" | "permission_missing",
  usedAccessToken: string
) {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    include: { credential: true }
  });
  if (!account?.credential || account.platform !== "instagram" || account.status !== "active") return;
  if (!shouldMarkInstagramAuthFailure(decryptToken(account.credential.accessTokenEncrypted), usedAccessToken)) return;
  await prisma.socialAccount.updateMany({
    where: {
      id: accountId,
      platform: "instagram",
      status: "active",
      credential: { is: { accessTokenEncrypted: account.credential.accessTokenEncrypted } }
    },
    data: { status }
  });
}

export async function getInstagramAccountAccessToken(accountId: string, requiredScope?: string) {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
  if (!account || account.platform !== "instagram" || account.status !== "active") {
    throw new Error("Instagram authorization is invalid. Reconnect the account before publishing.");
  }
  const credential = account.credential;
  const snapshot = credential?.accessTokenEncrypted;
  const result: InstagramTokenResolution = await resolveInstagramAccessToken({
    credential: credential ? {
      accessToken: decryptToken(credential.accessTokenEncrypted),
      expiresAt: credential.expiresAt,
      scopes: credential.scopes
    } : null,
    requiredScope,
    save: async (update) => {
      if (!credential || !snapshot) return;
      await prisma.oauthCredential.updateMany({
        where: {
          id: credential.id,
          accessTokenEncrypted: snapshot,
          socialAccount: { status: "active" }
        },
        data: { accessTokenEncrypted: encryptToken(update.accessToken), expiresAt: update.expiresAt }
      });
    },
    setStatus: async (status) => {
      await prisma.socialAccount.updateMany({
        where: {
          id: accountId,
          platform: "instagram",
          status: "active",
          ...(snapshot ? { credential: { is: { accessTokenEncrypted: snapshot } } } : { credential: { is: null } })
        },
        data: { status }
      });
    },
    refresh: (accessToken) => refreshInstagramToken({ accessToken })
  });

  // A worker or OAuth reconnection may have changed the credential during the Meta request.
  const current = await prisma.socialAccount.findUnique({ where: { id: accountId }, include: { credential: true } });
  if (current?.status === "active" && current.credential?.accessTokenEncrypted !== snapshot) {
    if (requiredScope && !current.credential?.scopes.includes(requiredScope)) {
      throw new Error("Instagram publishing permission is missing. Reconnect and approve instagram_business_content_publish.");
    }
    if (!current.credential?.expiresAt || current.credential.expiresAt.getTime() <= Date.now()) {
      throw new Error("Instagram authorization has expired. Reconnect the account before publishing.");
    }
    return decryptToken(current.credential.accessTokenEncrypted);
  }
  if (result.kind === "success" && current?.status === "active" && current.credential?.expiresAt &&
      current.credential.expiresAt.getTime() > Date.now()) {
    return decryptToken(current.credential.accessTokenEncrypted);
  }
  if (result.kind === "success") {
    throw new Error("Instagram authorization changed during publishing. Reconnect or retry the account.");
  }
  if (result.kind === "permission_missing") {
    throw new Error("Instagram publishing permission is missing. Reconnect and approve instagram_business_content_publish.");
  }
  if (result.kind === "token_expired") {
    throw new Error("Instagram authorization has expired. Reconnect the account before publishing.");
  }
  if (result.kind === "authorization_invalid") {
    throw new Error("Instagram authorization is invalid. Reconnect the account before publishing.");
  }
  throw new Error(result.message);
}

export async function refreshDueInstagramAccounts() {
  const due = await prisma.socialAccount.findMany({
    where: {
      platform: "instagram",
      status: "active",
      credential: {
        is: {
          OR: [
            { expiresAt: { lte: new Date(Date.now() + refreshWindowMs) } },
            { expiresAt: null }
          ]
        }
      }
    },
    select: { id: true }
  });
  for (const account of due) {
    try {
      await getInstagramAccountAccessToken(account.id);
    } catch (error) {
      console.error(`Instagram token refresh failed for account ${account.id}`, error);
    }
  }
  return due.length;
}
