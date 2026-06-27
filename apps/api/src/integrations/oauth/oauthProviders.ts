import type { Platform } from "@prisma/client";
import { config } from "../../config";
import { HttpError } from "../../utils/errors";

export type OAuthPlatformParam =
  | "twitter"
  | "x"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "pinterest";

export type OAuthClientAuthentication = "basic" | "body" | "tiktok";

export type OAuthProviderConfig = {
  platform: Platform;
  platformParam: OAuthPlatformParam;
  displayName: string;
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  profileUrl?: string;
  defaultScopes: string[];
  usesPkce: boolean;
  clientAuthentication: OAuthClientAuthentication;
  authorizationClientIdParam?: "client_id" | "client_key";
  scopeSeparator?: " " | ",";
  authorizationParams?: Record<string, string>;
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

const oauthPlatforms: Platform[] = [
  "instagram",
  "linkedin",
  "facebook",
  "youtube",
  "tiktok",
  "pinterest",
  "x"
];

const providerConfigs: Record<Platform, OAuthProviderConfig> = {
  instagram: {
    platform: "instagram",
    platformParam: "instagram",
    displayName: "Instagram",
    clientId: config.INSTAGRAM_CLIENT_ID || config.FACEBOOK_CLIENT_ID,
    clientSecret: config.INSTAGRAM_CLIENT_SECRET || config.FACEBOOK_CLIENT_SECRET,
    authorizationUrl: "https://www.facebook.com/v20.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/me?fields=id,name,picture",
    defaultScopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    usesPkce: false,
    clientAuthentication: "body"
  },
  linkedin: {
    platform: "linkedin",
    platformParam: "linkedin",
    displayName: "LinkedIn",
    clientId: config.LINKEDIN_CLIENT_ID,
    clientSecret: config.LINKEDIN_CLIENT_SECRET,
    authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    profileUrl: "https://api.linkedin.com/v2/userinfo",
    defaultScopes: ["openid", "profile", "email", "w_member_social"],
    usesPkce: false,
    clientAuthentication: "body"
  },
  facebook: {
    platform: "facebook",
    platformParam: "facebook",
    displayName: "Facebook",
    clientId: config.FACEBOOK_CLIENT_ID,
    clientSecret: config.FACEBOOK_CLIENT_SECRET,
    authorizationUrl: "https://www.facebook.com/v20.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/me?fields=id,name,picture",
    defaultScopes: ["public_profile", "pages_show_list", "pages_read_engagement", "pages_manage_posts"],
    usesPkce: false,
    clientAuthentication: "body"
  },
  youtube: {
    platform: "youtube",
    platformParam: "youtube",
    displayName: "YouTube",
    clientId: config.YOUTUBE_CLIENT_ID,
    clientSecret: config.YOUTUBE_CLIENT_SECRET,
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    defaultScopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload"
    ],
    usesPkce: false,
    clientAuthentication: "body",
    authorizationParams: {
      access_type: "offline",
      prompt: "consent"
    }
  },
  tiktok: {
    platform: "tiktok",
    platformParam: "tiktok",
    displayName: "TikTok",
    clientId: config.TIKTOK_CLIENT_ID,
    clientSecret: config.TIKTOK_CLIENT_SECRET,
    authorizationUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    profileUrl: "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
    defaultScopes: ["user.info.basic", "video.publish"],
    usesPkce: false,
    clientAuthentication: "tiktok",
    authorizationClientIdParam: "client_key",
    scopeSeparator: ","
  },
  pinterest: {
    platform: "pinterest",
    platformParam: "pinterest",
    displayName: "Pinterest",
    clientId: config.PINTEREST_CLIENT_ID,
    clientSecret: config.PINTEREST_CLIENT_SECRET,
    authorizationUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    profileUrl: "https://api.pinterest.com/v5/user_account",
    defaultScopes: [
      "user_accounts:read",
      "pins:read",
      "pins:write",
      "boards:read",
      "boards:write"
    ],
    usesPkce: false,
    clientAuthentication: "basic",
    scopeSeparator: ","
  },
  x: {
    platform: "x",
    platformParam: "twitter",
    displayName: "Twitter / X",
    clientId: config.X_CLIENT_ID,
    clientSecret: config.X_CLIENT_SECRET,
    authorizationUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    profileUrl: "https://api.x.com/2/users/me?user.fields=profile_image_url,username",
    defaultScopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    usesPkce: true,
    clientAuthentication: "basic"
  }
};

const providerSetup: Record<
  Platform,
  Omit<
    OAuthProviderStatus,
    | "configured"
    | "clientIdConfigured"
    | "clientSecretConfigured"
    | "clientSecretRequired"
    | "redirectUri"
    | "scopes"
  >
> = {
  instagram: {
    platform: "instagram",
    platformParam: "instagram",
    displayName: "Instagram",
    developerUrl: "https://developers.facebook.com/apps/",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/",
    requiredEnv: ["INSTAGRAM_CLIENT_ID 或 FACEBOOK_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET 或 FACEBOOK_CLIENT_SECRET"]
  },
  linkedin: {
    platform: "linkedin",
    platformParam: "linkedin",
    displayName: "LinkedIn",
    developerUrl: "https://www.linkedin.com/developers/apps",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow",
    requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]
  },
  facebook: {
    platform: "facebook",
    platformParam: "facebook",
    displayName: "Facebook",
    developerUrl: "https://developers.facebook.com/apps/",
    docsUrl: "https://developers.facebook.com/documentation/development/create-an-app/app-dashboard",
    requiredEnv: ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"]
  },
  youtube: {
    platform: "youtube",
    platformParam: "youtube",
    displayName: "YouTube",
    developerUrl: "https://console.cloud.google.com/apis/credentials",
    docsUrl: "https://developers.google.com/identity/protocols/oauth2/web-server",
    requiredEnv: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]
  },
  tiktok: {
    platform: "tiktok",
    platformParam: "tiktok",
    displayName: "TikTok",
    developerUrl: "https://developers.tiktok.com/apps/",
    docsUrl: "https://developers.tiktok.com/doc/login-kit-web/",
    requiredEnv: ["TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"]
  },
  pinterest: {
    platform: "pinterest",
    platformParam: "pinterest",
    displayName: "Pinterest",
    developerUrl: "https://developers.pinterest.com/apps/",
    docsUrl: "https://developers.pinterest.com/docs/getting-started/authentication/",
    requiredEnv: ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"]
  },
  x: {
    platform: "x",
    platformParam: "twitter",
    displayName: "Twitter / X",
    developerUrl: "https://developer.x.com/en/portal/dashboard",
    docsUrl: "https://docs.x.com/fundamentals/developer-portal",
    requiredEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET"]
  }
};

export function redirectUriFor(platform: Platform) {
  const publicPlatform = platform === "x" ? "twitter" : platform;
  return `${config.API_PUBLIC_URL}/api/v1/integrations/${publicPlatform}/oauth/callback`;
}

export function listOAuthProviderStatuses(): OAuthProviderStatus[] {
  return oauthPlatforms.map((platform) => {
    const provider = providerConfigs[platform];
    const setup = providerSetup[platform];
    const clientIdConfigured = Boolean(provider.clientId);
    const clientSecretConfigured = Boolean(provider.clientSecret);
    const clientSecretRequired = !provider.usesPkce || provider.clientAuthentication !== "body";

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

  if (
    platform === "x" ||
    platform === "facebook" ||
    platform === "instagram" ||
    platform === "tiktok" ||
    platform === "linkedin" ||
    platform === "youtube" ||
    platform === "pinterest"
  ) {
    return platform;
  }

  throw new HttpError(400, "Unsupported social platform");
}

export function getOAuthProvider(platform: string) {
  const normalizedPlatform = normalizeOAuthPlatform(platform);
  const provider = providerConfigs[normalizedPlatform];
  const clientSecretRequired = !provider.usesPkce || provider.clientAuthentication !== "body";

  if (!provider.clientId) {
    throw new HttpError(409, `${provider.displayName} OAuth client id is not configured`);
  }

  if (clientSecretRequired && !provider.clientSecret) {
    throw new HttpError(409, `${provider.displayName} OAuth client secret is not configured`);
  }

  return provider;
}
