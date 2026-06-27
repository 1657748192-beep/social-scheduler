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
    throw new HttpError(500, `${provider.displayName} OAuth client id is not configured`);
  }

  return provider;
}
