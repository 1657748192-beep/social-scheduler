import type { Platform } from "@prisma/client";
import { config } from "../../config";
import { HttpError } from "../../utils/errors";

export type OAuthPlatformParam = "twitter" | "x" | "facebook" | "instagram";

export type OAuthProviderConfig = {
  platform: Platform;
  displayName: string;
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  profileUrl?: string;
  defaultScopes: string[];
  usesPkce: boolean;
};

export type OAuthProviderStatus = {
  platform: Platform;
  platformParam: OAuthPlatformParam;
  displayName: string;
  configured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  clientSecretRequired: boolean;
  redirectUri: string;
  developerUrl: string;
  docsUrl: string;
  requiredEnv: string[];
  scopes: string[];
};

const providerConfigs: Record<Platform, OAuthProviderConfig | undefined> = {
  x: {
    platform: "x",
    displayName: "Twitter / X",
    clientId: config.X_CLIENT_ID,
    clientSecret: config.X_CLIENT_SECRET,
    authorizationUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    profileUrl: "https://api.x.com/2/users/me?user.fields=profile_image_url,username",
    defaultScopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    usesPkce: true
  },
  facebook: {
    platform: "facebook",
    displayName: "Facebook",
    clientId: config.FACEBOOK_CLIENT_ID,
    clientSecret: config.FACEBOOK_CLIENT_SECRET,
    authorizationUrl: "https://www.facebook.com/v20.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/me?fields=id,name,picture",
    defaultScopes: ["public_profile", "pages_show_list", "pages_manage_posts"],
    usesPkce: false
  },
  instagram: {
    platform: "instagram",
    displayName: "Instagram",
    clientId: config.INSTAGRAM_CLIENT_ID || config.FACEBOOK_CLIENT_ID,
    clientSecret: config.INSTAGRAM_CLIENT_SECRET || config.FACEBOOK_CLIENT_SECRET,
    authorizationUrl: "https://www.facebook.com/v20.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/me?fields=id,name,picture",
    defaultScopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    usesPkce: false
  },
  tiktok: undefined
};

const providerSetup: Record<Platform, Omit<OAuthProviderStatus, "configured" | "clientIdConfigured" | "clientSecretConfigured" | "clientSecretRequired" | "redirectUri" | "scopes"> | undefined> = {
  x: {
    platform: "x",
    platformParam: "twitter",
    displayName: "X / Twitter",
    developerUrl: "https://developer.x.com/en/portal/dashboard",
    docsUrl: "https://docs.x.com/fundamentals/developer-portal",
    requiredEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET"]
  },
  facebook: {
    platform: "facebook",
    platformParam: "facebook",
    displayName: "Facebook",
    developerUrl: "https://developers.facebook.com/apps/",
    docsUrl: "https://developers.facebook.com/documentation/development/create-an-app/app-dashboard",
    requiredEnv: ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"]
  },
  instagram: {
    platform: "instagram",
    platformParam: "instagram",
    displayName: "Instagram",
    developerUrl: "https://developers.facebook.com/apps/",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/",
    requiredEnv: ["INSTAGRAM_CLIENT_ID 或 FACEBOOK_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET 或 FACEBOOK_CLIENT_SECRET"]
  },
  tiktok: undefined
};

export function redirectUriFor(platform: Platform) {
  const publicPlatform = platform === "x" ? "twitter" : platform;
  return `${config.API_PUBLIC_URL}/api/v1/integrations/${publicPlatform}/oauth/callback`;
}

export function listOAuthProviderStatuses(): OAuthProviderStatus[] {
  return (["x", "facebook", "instagram"] as Platform[]).map((platform) => {
    const provider = providerConfigs[platform];
    const setup = providerSetup[platform];

    if (!provider || !setup) {
      throw new HttpError(500, "OAuth provider setup is missing");
    }

    const clientIdConfigured = Boolean(provider.clientId);
    const clientSecretConfigured = Boolean(provider.clientSecret);
    const clientSecretRequired = !provider.usesPkce;

    return {
      ...setup,
      configured: clientIdConfigured && (!clientSecretRequired || clientSecretConfigured),
      clientIdConfigured,
      clientSecretConfigured,
      clientSecretRequired,
      redirectUri: redirectUriFor(platform),
      scopes: provider.defaultScopes
    };
  });
}

export function normalizeOAuthPlatform(platform: string): Platform {
  if (platform === "twitter") {
    return "x";
  }

  if (platform === "x" || platform === "facebook" || platform === "instagram") {
    return platform;
  }

  throw new HttpError(400, "Unsupported social platform");
}

export function getOAuthProvider(platform: string) {
  const normalizedPlatform = normalizeOAuthPlatform(platform);
  const provider = providerConfigs[normalizedPlatform];

  if (!provider) {
    throw new HttpError(400, "OAuth provider is not configured for this platform");
  }

  if (!provider.clientId) {
    throw new HttpError(409, `${provider.displayName} OAuth client id is not configured`);
  }

  if (!provider.usesPkce && !provider.clientSecret) {
    throw new HttpError(409, `${provider.displayName} OAuth client secret is not configured`);
  }

  return provider;
}
