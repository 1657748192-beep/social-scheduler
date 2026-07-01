import { createHash, randomBytes } from "crypto";
import type { Platform } from "@prisma/client";
import { z } from "zod";
import { config } from "../config";
import {
  getOAuthProvider,
  normalizeOAuthPlatform,
  redirectUriFor,
  type OAuthProviderConfig
} from "../integrations/oauth/oauthProviders";
import { prisma } from "../prisma";
import { encryptToken } from "../utils/tokenCrypto";
import { HttpError } from "../utils/errors";
import { requireWorkspaceManager, requireWorkspaceMembership } from "./workspaceService";

export const startOAuthSchema = z.object({
  workspaceId: z.string().uuid()
});

export const createAuthorizationLinkSchema = z.object({
  platform: z.string().min(1)
});

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
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
  expiresAt?: Date;
};

async function createOAuthAuthorization({
  userId,
  platformParam,
  workspaceId,
  authorizationLinkId,
  expiresAt
}: CreateOAuthStateOptions) {
  const provider = getOAuthProvider(platformParam);

  const state = randomBase64Url();
  const codeVerifier = provider.usesPkce ? randomBase64Url(64) : undefined;
  const redirectUri = redirectUriFor(provider.platform);
  const scopes = provider.defaultScopes;
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
  const credentialTokenResponse = await exchangeFacebookLongLivedToken(provider, tokenResponse);
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
  const scopes = parseScopes(credentialTokenResponse, oauthState.scopes);
  const expiresAt = credentialTokenResponse.expires_in
    ? new Date(Date.now() + credentialTokenResponse.expires_in * 1000)
    : null;

  const socialAccount = await prisma.$transaction(async (tx) => {
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
            expiresAt
          },
          update: {
            accessTokenEncrypted: encryptToken(page.accessToken),
            tokenType: "Bearer",
            scopes,
            expiresAt
          }
        });

        firstAccount ??= account;
      }

      await tx.oauthState.delete({
        where: { id: oauthState.id }
      });

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
        capabilities: {
          oauth2: true,
          scopes
        }
      },
      update: {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accountType: profile.accountType,
        status: "active",
        capabilities: {
          oauth2: true,
          scopes
        }
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
        expiresAt
      },
      update: {
        accessTokenEncrypted: encryptToken(credentialTokenResponse.access_token),
        refreshTokenEncrypted: credentialTokenResponse.refresh_token
          ? encryptToken(credentialTokenResponse.refresh_token)
          : undefined,
        tokenType: credentialTokenResponse.token_type ?? "Bearer",
        scopes,
        expiresAt
      }
    });

    await tx.oauthState.delete({
      where: { id: oauthState.id }
    });

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

  return prisma.socialAccount.findMany({
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
          updatedAt: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
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
