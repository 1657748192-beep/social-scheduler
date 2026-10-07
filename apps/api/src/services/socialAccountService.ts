import { createHash, randomBytes } from "crypto";
import { validateTikTokMetricsGrant } from "../integrations/oauth/tiktokMetricsAuthorization";
import type { Platform } from "@prisma/client";
import { z } from "zod";
import { config } from "../config";
import {
  getOAuthProvider,
  normalizeOAuthPlatform,
  redirectUriFor,
  type OAuthProviderConfig
} from "../integrations/oauth/oauthProviders";
import {
  buildInstagramEngagementScopes,
  parseInstagramGrantedScopes,
  validateInstagramEngagementReauthorization
} from "../integrations/oauth/instagramEngagementOAuth";
import { PinterestPublisher } from "../integrations/social/pinterestPublisher";
import { exchangeInstagramLongLivedToken } from "../integrations/social/instagramTokenRefresh";
import { refreshDeadline } from "../integrations/social/oauthExpiry";
import { TikTokPublisher } from "../integrations/social/tiktokPublisher";
import { prisma } from "../prisma";
import { encryptToken } from "../utils/tokenCrypto";
import { HttpError } from "../utils/errors";
import { removeOAuthStateIfPresent } from "./oauthStateCleanup";
import { requireWorkspaceManager, requireWorkspaceMembership } from "./workspaceService";

export const startOAuthSchema = z.object({
  workspaceId: z.string().uuid()
});

export const createAuthorizationLinkSchema = z.object({
  platform: z.string().min(1)
});

export const createPinterestBoardSchema = z.object({
  name: z.string().trim().min(1).max(180)
});

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  permissions?: string | string[];
  expires_in?: number;
  refresh_expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

type ProviderProfile = {
  providerAccountId: string;
  displayName: string;
  avatarUrl?: string;
  accountType?: string;
};

type FacebookPageProfile = ProviderProfile & {
  accessToken: string;
};

function base64UrlSha256(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function hashAuthorizationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseScopes(tokenResponse: TokenResponse, fallbackScopes: string[]) {
  if (!tokenResponse.scope) {
    return fallbackScopes;
  }

  return tokenResponse.scope.split(/[ ,]+/).filter(Boolean);
}

async function exchangeCodeForToken(
  provider: OAuthProviderConfig,
  code: string,
  redirectUri: string,
  codeVerifier?: string
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });

  if (provider.usesPkce && codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if (provider.clientAuthentication === "basic" && provider.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString(
      "base64"
    )}`;
  }

  if (provider.clientAuthentication === "body") {
    body.set("client_id", provider.clientId);
    if (provider.clientSecret) {
      body.set("client_secret", provider.clientSecret);
    }
  }

  if (provider.clientAuthentication === "tiktok") {
    body.set("client_key", provider.clientId);
    if (provider.clientSecret) {
      body.set("client_secret", provider.clientSecret);
    }
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body
  });

  const payload = (await response.json().catch(() => null)) as TokenResponse | { error?: string } | null;

  if (!response.ok || !payload || !("access_token" in payload)) {
    throw new HttpError(400, "OAuth token exchange failed", payload);
  }

  return payload;
}

async function fetchProviderProfile(provider: OAuthProviderConfig, accessToken: string): Promise<ProviderProfile> {
  if (!provider.profileUrl) {
    throw new HttpError(500, "Provider profile endpoint is not configured");
  }

  const response = await fetch(provider.profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = (await response.json().catch(() => null)) as any;

  if (!response.ok || !payload) {
    throw new HttpError(400, "OAuth profile fetch failed", payload);
  }

  if (provider.platform === "x") {
    return {
      providerAccountId: payload.data.id,
      displayName: payload.data.name || payload.data.username,
      avatarUrl: payload.data.profile_image_url,
      accountType: "profile"
    };
  }

  if (provider.platform === "linkedin") {
    return {
      providerAccountId: payload.sub,
      displayName: payload.name,
      avatarUrl: payload.picture,
      accountType: "profile"
    };
  }

  if (provider.platform === "instagram") {
    const providerAccountId = payload.user_id || payload.id;

    if (!providerAccountId) {
      throw new HttpError(400, "Instagram profile was not found", payload);
    }

    return {
      providerAccountId,
      displayName: payload.username || payload.name || "Instagram account",
      avatarUrl: payload.profile_picture_url,
      accountType: payload.account_type || "profile"
    };
  }

  if (provider.platform === "youtube") {
    const channel = payload.items?.[0];

    if (!channel) {
      throw new HttpError(400, "YouTube channel profile was not found", payload);
    }

    return {
      providerAccountId: channel.id,
      displayName: channel.snippet?.title,
      avatarUrl: channel.snippet?.thumbnails?.default?.url,
      accountType: "channel"
    };
  }

  if (provider.platform === "tiktok") {
    const profile = payload.data?.user;

    if (!profile?.open_id) {
      throw new HttpError(400, "TikTok profile was not found", payload);
    }

    return {
      providerAccountId: profile.open_id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      accountType: "profile"
    };
  }

  if (provider.platform === "pinterest") {
    return {
      providerAccountId: payload.id,
      displayName: payload.profile_name || payload.username,
      avatarUrl: payload.profile_image,
      accountType: payload.account_type || "profile"
    };
  }

  return {
    providerAccountId: payload.id,
    displayName: payload.name,
    avatarUrl: payload.picture?.data?.url,
    accountType: "profile"
  };
}

async function exchangeFacebookLongLivedToken(provider: OAuthProviderConfig, tokenResponse: TokenResponse) {
  if (provider.platform !== "facebook" || !provider.clientSecret) {
    return tokenResponse;
  }

  const url = new URL(provider.tokenUrl);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("client_secret", provider.clientSecret);
  url.searchParams.set("fb_exchange_token", tokenResponse.access_token);

  const response = await fetch(url);
  const payload = (await response.json().catch(() => null)) as TokenResponse | null;

  if (!response.ok || !payload?.access_token) {
    return tokenResponse;
  }

  return {
    ...tokenResponse,
    ...payload
  };
}

async function exchangeInstagramCredential(provider: OAuthProviderConfig, tokenResponse: TokenResponse) {
  if (provider.platform !== "instagram") {
    return tokenResponse;
  }
  if (!provider.clientSecret) {
    throw new HttpError(500, "Instagram client secret is not configured");
  }
  const payload = await exchangeInstagramLongLivedToken({
    shortLivedToken: tokenResponse.access_token,
    clientSecret: provider.clientSecret
  });
  return {
    ...tokenResponse,
    ...payload
  };
}

async function exchangeLongLivedToken(provider: OAuthProviderConfig, tokenResponse: TokenResponse) {
  const facebookTokenResponse = await exchangeFacebookLongLivedToken(provider, tokenResponse);
  return exchangeInstagramCredential(provider, facebookTokenResponse);
}

async function fetchFacebookPages(accessToken: string): Promise<FacebookPageProfile[]> {
  const url = new URL("https://graph.facebook.com/v20.0/me/accounts");
  url.searchParams.set("fields", "id,name,access_token,picture{url}");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const payload = (await response.json().catch(() => null)) as any;

  if (!response.ok || !Array.isArray(payload?.data)) {
    return [];
  }

  return payload.data
    .filter((page: any) => page?.id && page?.name && page?.access_token)
    .map((page: any) => ({
      providerAccountId: page.id,
      displayName: page.name,
      avatarUrl: page.picture?.data?.url,
      accountType: "page",
      accessToken: page.access_token
    }));
}

type CreateOAuthStateOptions = {
  userId: string;
  platformParam: string;
  workspaceId: string;
  authorizationLinkId?: string;
  scopes?: string[];
  instagramEngagementSocialAccountId?: string;
  expiresAt?: Date;
};

async function createOAuthAuthorization({
  userId,
  platformParam,
  workspaceId,
  authorizationLinkId,
  scopes: requestedScopes,
  instagramEngagementSocialAccountId,
  expiresAt
}: CreateOAuthStateOptions) {
  const provider = getOAuthProvider(platformParam);

  const state = randomBase64Url();
  const codeVerifier = provider.usesPkce ? randomBase64Url(64) : undefined;
  const redirectUri = redirectUriFor(provider.platform);
  const scopes = requestedScopes ?? provider.defaultScopes;
  const defaultExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const stateExpiresAt =
    expiresAt && expiresAt.getTime() < defaultExpiresAt.getTime() ? expiresAt : defaultExpiresAt;

  await prisma.oauthState.create({
    data: {
      workspaceId,
      userId,
      platform: provider.platform,
      state,
      authorizationLinkId,
      instagramEngagementSocialAccountId,
      codeVerifier,
      redirectUri,
      scopes,
      expiresAt: stateExpiresAt
    }
  });

  const authorizationUrl = new URL(provider.authorizationUrl);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set(provider.authorizationClientIdParam ?? "client_id", provider.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);

  if (provider.platform === "facebook" && config.FACEBOOK_LOGIN_CONFIG_ID) {
    authorizationUrl.searchParams.set("config_id", config.FACEBOOK_LOGIN_CONFIG_ID);
    authorizationUrl.searchParams.set("override_default_response_type", "true");
  } else {
    authorizationUrl.searchParams.set("scope", scopes.join(provider.scopeSeparator ?? " "));
  }

  Object.entries(provider.authorizationParams ?? {}).forEach(([key, value]) => {
    authorizationUrl.searchParams.set(key, value);
  });

  if (provider.usesPkce && codeVerifier) {
    authorizationUrl.searchParams.set("code_challenge", base64UrlSha256(codeVerifier));
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
  }

  return {
    authorizationUrl: authorizationUrl.toString(),
    state,
    platform: provider.platform
  };
}

export async function startOAuth(userId: string, platformParam: string, workspaceId: string) {
  await requireWorkspaceManager(userId, workspaceId);

  return createOAuthAuthorization({
    userId,
    platformParam,
    workspaceId
  });
}

export async function startInstagramEngagementOAuth(
  userId: string,
  workspaceId: string,
  socialAccountId: string
) {
  await requireWorkspaceManager(userId, workspaceId);
  const account = await prisma.socialAccount.findFirst({
    where: { id: socialAccountId, workspaceId, platform: "instagram", status: "active" },
    include: { credential: { select: { scopes: true } } }
  });
  if (!account?.credential) {
    throw new HttpError(404, "Connected Instagram account not found");
  }

  const provider = getOAuthProvider("instagram");
  const scopes = buildInstagramEngagementScopes([
    ...account.credential.scopes,
    ...provider.defaultScopes
  ]);
  return createOAuthAuthorization({
    userId,
    platformParam: "instagram",
    workspaceId,
    scopes,
    instagramEngagementSocialAccountId: account.id
  });
}

export async function createAuthorizationLink(
  userId: string,
  workspaceId: string,
  input: z.infer<typeof createAuthorizationLinkSchema>
) {
  await requireWorkspaceManager(userId, workspaceId);

  const provider = getOAuthProvider(input.platform);
  const token = randomBase64Url();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const link = await prisma.oauthAuthorizationLink.create({
    data: {
      workspaceId,
      platform: provider.platform,
      tokenHash: hashAuthorizationToken(token),
      createdById: userId,
      expiresAt
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  return {
    id: link.id,
    platform: link.platform,
    platformParam: provider.platformParam,
    displayName: provider.displayName,
    workspace: link.workspace,
    expiresAt: link.expiresAt,
    shareUrl: `${config.WEB_APP_URL}/oauth/share/${token}`,
    startUrl: `${config.API_PUBLIC_URL}/api/v1/integrations/oauth/share/${token}/start`
  };
}

export async function getAuthorizationLink(token: string) {
  const link = await prisma.oauthAuthorizationLink.findUnique({
    where: {
      tokenHash: hashAuthorizationToken(token)
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  if (!link || link.revokedAt) {
    throw new HttpError(404, "Authorization link not found");
  }

  const provider = getOAuthProvider(link.platform);
  const expired = link.expiresAt <= new Date();

  return {
    id: link.id,
    platform: link.platform,
    platformParam: provider.platformParam,
    displayName: provider.displayName,
    workspace: link.workspace,
    expiresAt: link.expiresAt,
    expired,
    startUrl: `${config.API_PUBLIC_URL}/api/v1/integrations/oauth/share/${token}/start`
  };
}

export async function startSharedOAuth(token: string) {
  const link = await prisma.oauthAuthorizationLink.findUnique({
    where: {
      tokenHash: hashAuthorizationToken(token)
    }
  });

  if (!link || link.revokedAt) {
    throw new HttpError(404, "Authorization link not found");
  }

  if (link.expiresAt <= new Date()) {
    throw new HttpError(410, "Authorization link expired");
  }

  return createOAuthAuthorization({
    userId: link.createdById,
    platformParam: link.platform,
    workspaceId: link.workspaceId,
    authorizationLinkId: link.id,
    expiresAt: link.expiresAt
  });
}

export async function completeOAuth(platformParam: string, code: string, state: string) {
  const provider = getOAuthProvider(platformParam);
  const normalizedPlatform = normalizeOAuthPlatform(platformParam);

  const oauthState = await prisma.oauthState.findUnique({
    where: { state }
  });

  if (!oauthState || oauthState.platform !== normalizedPlatform) {
    throw new HttpError(400, "Invalid OAuth state");
  }

  // A supplemental state must never enter ordinary multi-Page binding.
  if (oauthState.facebookEngagementSocialAccountId) {
    throw new HttpError(400, "Use the dedicated Facebook engagement authorization callback.");
  }

  if (oauthState.expiresAt <= new Date()) {
    await prisma.oauthState.delete({ where: { id: oauthState.id } }).catch(() => null);
    throw new HttpError(400, "OAuth state expired");
  }

  const tokenResponse = await exchangeCodeForToken(
    provider,
    code,
    oauthState.redirectUri,
    oauthState.codeVerifier ?? undefined
  );
  const credentialTokenResponse = await exchangeLongLivedToken(provider, tokenResponse);
  const profile = await fetchProviderProfile(provider, credentialTokenResponse.access_token);
  const canReadFacebookPages =
    provider.platform === "facebook" && oauthState.scopes.includes("pages_show_list");
  const facebookPages =
    canReadFacebookPages
      ? await fetchFacebookPages(credentialTokenResponse.access_token)
      : [];
  if (canReadFacebookPages && !facebookPages.length) {
    await prisma.oauthState.delete({ where: { id: oauthState.id } }).catch(() => null);
    throw new HttpError(
      400,
      "Facebook Page was not returned. Confirm the user is a Page admin, allow pages_show_list/pages_read_engagement/pages_manage_posts/pages_manage_metadata, then authorize again."
    );
  }
  const actualInstagramScopes = provider.platform === "instagram"
    ? parseInstagramGrantedScopes(credentialTokenResponse)
    : null;
  if (provider.platform === "instagram" && (!actualInstagramScopes || !actualInstagramScopes.length)) {
    await prisma.oauthState.delete({ where: { id: oauthState.id } }).catch(() => null);
    throw new HttpError(400, "Instagram did not return the granted permissions; the existing connection was not changed.");
  }
  const scopes = provider.platform === "instagram"
    ? actualInstagramScopes!
    : provider.platform === "tiktok" && oauthState.scopes.some(scope => ["video.list", "user.info.stats"].includes(scope))
      ? validateTikTokMetricsGrant(credentialTokenResponse.scope, [])
      : parseScopes(credentialTokenResponse, oauthState.scopes);
  const engagementAccountId = oauthState.instagramEngagementSocialAccountId;
  const engagementAccount = engagementAccountId
    ? await prisma.socialAccount.findFirst({
        where: { id: engagementAccountId, workspaceId: oauthState.workspaceId, platform: "instagram" },
        include: { credential: { select: { scopes: true } } }
      })
    : null;
  if (engagementAccountId) {
    const validation = engagementAccount?.credential
      ? validateInstagramEngagementReauthorization({
          expectedProviderAccountId: engagementAccount.providerAccountId,
          actualProviderAccountId: profile.providerAccountId,
          existingScopes: engagementAccount.credential.scopes,
          grantedScopes: scopes
        })
      : { accepted: false as const, reason: "account_mismatch" as const };
    if (!validation.accepted) {
      await prisma.oauthState.delete({ where: { id: oauthState.id } }).catch(() => null);
      throw new HttpError(
        400,
        validation.reason === "publishing_scope_missing"
          ? "Instagram publishing permissions were not retained; the existing connection was not changed."
          : "The authorized Instagram account did not match the connected account; the existing connection was not changed."
      );
    }
  }
  const expiresAt = credentialTokenResponse.expires_in
    ? new Date(Date.now() + credentialTokenResponse.expires_in * 1000)
    : null;
  const refreshTokenExpiresAt = refreshDeadline(provider.platform, credentialTokenResponse);
  const capabilities = {
    oauth2: true,
    scopes,
    ...(provider.platform === "pinterest" ? { pinterestApiEnvironment: config.PINTEREST_API_ENV } : {})
  };

  const socialAccount = await prisma.$transaction(async (tx) => {
    if (provider.platform === "tiktok" && oauthState.scopes.some(scope => ["video.list", "user.info.stats"].includes(scope))) {
      const previous = await tx.socialAccount.findUnique({
        where: { workspaceId_platform_providerAccountId: {
          workspaceId: oauthState.workspaceId, platform: "tiktok", providerAccountId: profile.providerAccountId
        } },
        select: { credential: { select: { scopes: true } } }
      });
      validateTikTokMetricsGrant(credentialTokenResponse.scope, previous?.credential?.scopes ?? []);
    }
    if (engagementAccountId && engagementAccount) {
      const account = await tx.socialAccount.update({
        where: { id: engagementAccount.id },
        data: {
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          accountType: profile.accountType,
          status: "active",
          capabilities
        }
      });
      await tx.oauthCredential.update({
        where: { socialAccountId: engagementAccount.id },
        data: {
          accessTokenEncrypted: encryptToken(credentialTokenResponse.access_token),
          refreshTokenEncrypted: credentialTokenResponse.refresh_token
            ? encryptToken(credentialTokenResponse.refresh_token)
            : undefined,
          tokenType: credentialTokenResponse.token_type ?? "Bearer",
          scopes,
          expiresAt,
          refreshTokenExpiresAt
        }
      });
      await removeOAuthStateIfPresent(tx.oauthState, oauthState.id);
      return account;
    }

    if (facebookPages.length) {
      let firstAccount:
        | Awaited<ReturnType<typeof tx.socialAccount.upsert>>
        | null = null;

      for (const page of facebookPages) {
        const account = await tx.socialAccount.upsert({
          where: {
            workspaceId_platform_providerAccountId: {
              workspaceId: oauthState.workspaceId,
              platform: provider.platform,
              providerAccountId: page.providerAccountId
            }
          },
          create: {
            workspaceId: oauthState.workspaceId,
            platform: provider.platform,
            providerAccountId: page.providerAccountId,
            displayName: page.displayName,
            avatarUrl: page.avatarUrl,
            accountType: page.accountType,
            status: "active",
            capabilities: {
              oauth2: true,
              scopes,
              pagePublishing: true
            }
          },
          update: {
            displayName: page.displayName,
            avatarUrl: page.avatarUrl,
            accountType: page.accountType,
            status: "active",
            capabilities: {
              oauth2: true,
              scopes,
              pagePublishing: true
            }
          }
        });

        await tx.oauthCredential.upsert({
          where: {
            socialAccountId: account.id
          },
          create: {
            socialAccountId: account.id,
            accessTokenEncrypted: encryptToken(page.accessToken),
            tokenType: "Bearer",
            scopes,
            expiresAt: null,
            refreshTokenExpiresAt: null
          },
          update: {
            accessTokenEncrypted: encryptToken(page.accessToken),
            tokenType: "Bearer",
            scopes,
            expiresAt: null,
            refreshTokenExpiresAt: null
          }
        });

        firstAccount ??= account;
      }

      await removeOAuthStateIfPresent(tx.oauthState, oauthState.id);

      return firstAccount!;
    }

    const account = await tx.socialAccount.upsert({
      where: {
        workspaceId_platform_providerAccountId: {
          workspaceId: oauthState.workspaceId,
          platform: provider.platform,
          providerAccountId: profile.providerAccountId
        }
      },
      create: {
        workspaceId: oauthState.workspaceId,
        platform: provider.platform,
        providerAccountId: profile.providerAccountId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accountType: profile.accountType,
        status: "active",
        capabilities
      },
      update: {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accountType: profile.accountType,
        status: "active",
        capabilities
      }
    });

    await tx.oauthCredential.upsert({
      where: {
        socialAccountId: account.id
      },
      create: {
        socialAccountId: account.id,
        accessTokenEncrypted: encryptToken(credentialTokenResponse.access_token),
        refreshTokenEncrypted: credentialTokenResponse.refresh_token
          ? encryptToken(credentialTokenResponse.refresh_token)
          : undefined,
        tokenType: credentialTokenResponse.token_type ?? "Bearer",
        scopes,
        expiresAt,
        refreshTokenExpiresAt
      },
      update: {
        accessTokenEncrypted: encryptToken(credentialTokenResponse.access_token),
        refreshTokenEncrypted: credentialTokenResponse.refresh_token
          ? encryptToken(credentialTokenResponse.refresh_token)
          : undefined,
        tokenType: credentialTokenResponse.token_type ?? "Bearer",
        scopes,
        expiresAt,
        refreshTokenExpiresAt
      }
    });

    await removeOAuthStateIfPresent(tx.oauthState, oauthState.id);

    return account;
  });

  if (oauthState.authorizationLinkId) {
    await prisma.oauthAuthorizationLink
      .update({
        where: {
          id: oauthState.authorizationLinkId
        },
        data: {
          lastUsedAt: new Date()
        }
      })
      .catch(() => null);
  }

  return {
    account: socialAccount,
    sharedAuthorization: Boolean(oauthState.authorizationLinkId)
  };
}

export async function listSocialAccounts(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  const accounts = await prisma.socialAccount.findMany({
    where: {
      workspaceId
    },
    select: {
      id: true,
      platform: true,
      providerAccountId: true,
      displayName: true,
      avatarUrl: true,
      accountType: true,
      status: true,
      capabilities: true,
      createdAt: true,
      credential: {
        select: {
          scopes: true,
          expiresAt: true,
          refreshTokenExpiresAt: true,
          updatedAt: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return accounts.map((account) => {
    const currentCapabilities =
      typeof account.capabilities === "object" && account.capabilities !== null && !Array.isArray(account.capabilities)
        ? account.capabilities as Record<string, unknown>
        : {};
    const scopes = account.credential?.scopes ?? [];
    return {
      ...account,
      capabilities: {
        ...currentCapabilities,
        ...(account.platform === "instagram" ? {
          instagramEngagement: {
            manageComments: scopes.includes("instagram_business_manage_comments"),
            manageMessages: scopes.includes("instagram_business_manage_messages"),
            webhookConfigured: false,
            webhookServerReady: Boolean(config.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && config.INSTAGRAM_CLIENT_SECRET)
          }
        } : {})
      }
    };
  });
}

export async function getTikTokCreatorPublishInfo(
  userId: string,
  workspaceId: string,
  socialAccountId: string
) {
  await requireWorkspaceMembership(userId, workspaceId);
  return new TikTokPublisher().getCreatorPublishInfo(workspaceId, socialAccountId);
}

export async function getPinterestBoards(
  userId: string,
  workspaceId: string,
  socialAccountId: string
) {
  await requireWorkspaceMembership(userId, workspaceId);
  return new PinterestPublisher().listBoards(workspaceId, socialAccountId);
}

export async function createPinterestBoard(
  userId: string,
  workspaceId: string,
  socialAccountId: string,
  input: z.infer<typeof createPinterestBoardSchema>
) {
  await requireWorkspaceManager(userId, workspaceId);
  return new PinterestPublisher().createBoard(workspaceId, socialAccountId, input.name);
}

export async function disconnectSocialAccount(
  userId: string,
  workspaceId: string,
  socialAccountId: string
) {
  await requireWorkspaceManager(userId, workspaceId);

  const account = await prisma.socialAccount.findFirst({
    where: {
      id: socialAccountId,
      workspaceId
    }
  });

  if (!account) {
    throw new HttpError(404, "Social account not found");
  }

  return prisma.$transaction(async (tx) => {
    await tx.oauthCredential.deleteMany({
      where: {
        socialAccountId: account.id
      }
    });

    return tx.socialAccount.delete({
      where: {
        id: account.id
      },
      select: {
        id: true,
        platform: true,
        displayName: true,
        status: true
      }
    });
  });
}
