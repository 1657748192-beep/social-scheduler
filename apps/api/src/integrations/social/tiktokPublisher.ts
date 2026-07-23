import type { OauthCredential, Platform, Prisma, SocialAccount } from "@prisma/client";
import { config } from "../../config";
import { prisma } from "../../prisma";
import { decryptToken, encryptToken } from "../../utils/tokenCrypto";
import type { PublishInput, PublishMediaAsset, PublishResult, SocialPublisher } from "./socialPublisher";

const tiktokApiBaseUrl = "https://open.tiktokapis.com";
const publishStatusPollIntervalMs = 2_000;
const maxPublishStatusChecks = 150;

export const tiktokPrivacyLevels = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY"
] as const;

export type TikTokPrivacyLevel = (typeof tiktokPrivacyLevels)[number];

export type TikTokCreatorPublishInfo = {
  creatorUsername: string;
  creatorNickname: string;
  creatorAvatarUrl?: string;
  privacyLevelOptions: TikTokPrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec?: number;
  directPostAudited: boolean;
};

export type TikTokPublishSettings = {
  privacyLevel: TikTokPrivacyLevel;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  consentConfirmed: boolean;
  brandOrganic: boolean;
  isAigc: boolean;
};

type TikTokAccount = SocialAccount & {
  credential: OauthCredential | null;
};

type TikTokTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type TikTokApiError = {
  code?: string;
  message?: string;
  log_id?: string;
};

type TikTokCreatorInfoResponse = {
  data?: {
    creator_avatar_url?: string;
    creator_username?: string;
    creator_nickname?: string;
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  };
  error?: TikTokApiError;
};

type TikTokInitPublishResponse = {
  data?: {
    publish_id?: string;
  };
  error?: TikTokApiError;
};

type TikTokPublishStatusResponse = {
  data?: {
    status?: string;
    fail_reason?: string;
    publicaly_available_post_id?: Array<string | number>;
  };
  error?: TikTokApiError;
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function describeTikTokError(error: TikTokApiError | undefined, fallback: string) {
  if (!error) {
    return fallback;
  }

  return error.message ? `${error.code ?? "error"}: ${error.message}` : error.code ?? fallback;
}

function isTikTokPrivacyLevel(value: unknown): value is TikTokPrivacyLevel {
  return typeof value === "string" && tiktokPrivacyLevels.includes(value as TikTokPrivacyLevel);
}

export function readTikTokPublishSettings(value: Prisma.JsonValue): TikTokPublishSettings | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (!isTikTokPrivacyLevel(payload.privacyLevel) || typeof payload.consentConfirmed !== "boolean") {
    return null;
  }

  return {
    privacyLevel: payload.privacyLevel,
    allowComment: payload.allowComment === true,
    allowDuet: payload.allowDuet === true,
    allowStitch: payload.allowStitch === true,
    consentConfirmed: payload.consentConfirmed,
    brandOrganic: payload.brandOrganic === true,
    isAigc: payload.isAigc === true
  };
}

export class TikTokPublisher implements SocialPublisher {
  platform: Platform = "tiktok";

  async validate(input: PublishInput) {
    const videos = input.media.filter((asset) => asset.mimeType.startsWith("video/"));

    if (videos.length !== 1 || input.media.length !== 1) {
      throw new Error("TikTok publishing requires exactly one video asset");
    }

    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(videos[0].mimeType.toLowerCase())) {
      throw new Error("TikTok videos must be MP4, MOV, or WebM files");
    }

    if (videos[0].sizeBytes > 4 * 1024 * 1024 * 1024) {
      throw new Error("TikTok videos must be 4 GB or smaller");
    }

    const settings = readTikTokPublishSettings(input.platformPayload);
    if (!settings?.consentConfirmed) {
      throw new Error("Confirm the TikTok music usage declaration before publishing");
    }
  }

  async getCreatorPublishInfo(workspaceId: string, socialAccountId: string): Promise<TikTokCreatorPublishInfo> {
    const account = await this.findTikTokAccount(workspaceId, socialAccountId);

    if (!account?.credential) {
      throw new Error("The selected TikTok account is unavailable. Reconnect it and select it again before publishing.");
    }

    this.assertPublishingScope(account);
    const accessToken = await this.getAccessToken(account);
    return this.queryCreatorPublishInfo(accessToken);
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const account = await this.findTikTokAccount(input.workspaceId, input.socialAccountId);
    if (!account?.credential) {
      throw new Error("The selected TikTok account is unavailable. Reconnect it and select it again before publishing.");
    }

    this.assertPublishingScope(account);
    const settings = readTikTokPublishSettings(input.platformPayload)!;
    const accessToken = await this.getAccessToken(account);
    const creatorInfo = await this.queryCreatorPublishInfo(accessToken);

    if (!creatorInfo.privacyLevelOptions.includes(settings.privacyLevel)) {
      throw new Error("TikTok privacy options changed. Open the TikTok platform settings and choose a privacy option again.");
    }

    if (!creatorInfo.directPostAudited && settings.privacyLevel !== "SELF_ONLY") {
      throw new Error("This TikTok app is not approved yet, so videos can only be posted as Only me (private).");
    }

    const video = input.media[0];
    const publishId = await this.initializeDirectPost(accessToken, input.text, video, creatorInfo, settings);
    const status = await this.waitForPublishCompletion(accessToken, publishId);
    const providerPostId = status.publicaly_available_post_id?.[0]?.toString() ?? publishId;

    return {
      providerPostId,
      rawResponse: {
        platform: "tiktok",
        type: "video",
        tiktokAccountId: account.providerAccountId,
        socialAccountId: account.id,
        creatorUsername: creatorInfo.creatorUsername,
        publishId,
        providerPostId,
        privacyLevel: settings.privacyLevel,
        mediaAssetIds: [video.id]
      }
    };
  }

  private async findTikTokAccount(workspaceId: string, socialAccountId: string) {
    return prisma.socialAccount.findFirst({
      where: {
        id: socialAccountId,
        workspaceId,
        platform: "tiktok",
        status: "active",
        accountType: "profile"
      },
      include: {
        credential: true
      }
    });
  }

  private assertPublishingScope(account: TikTokAccount) {
    if (!account.credential?.scopes.includes("video.publish")) {
      throw new Error("TikTok video publishing permission is missing. Enable video.publish and reconnect the TikTok account.");
    }
  }

  private async getAccessToken(account: TikTokAccount) {
    const credential = account.credential;
    if (!credential) {
      throw new Error("TikTok credential is missing");
    }

    const expiresSoon = credential.expiresAt
      ? credential.expiresAt.getTime() <= Date.now() + 60 * 1000
      : false;

    if (!expiresSoon) {
      return decryptToken(credential.accessTokenEncrypted);
    }

    if (!credential.refreshTokenEncrypted) {
      await prisma.socialAccount.update({ where: { id: account.id }, data: { status: "token_expired" } });
      throw new Error("TikTok authorization expired. Reconnect the TikTok account before publishing.");
    }

    const refreshToken = decryptToken(credential.refreshTokenEncrypted);
    const tokenResponse = await this.refreshAccessToken(refreshToken);

    if (!tokenResponse.access_token) {
      await prisma.socialAccount.update({ where: { id: account.id }, data: { status: "token_expired" } });
      throw new Error(
        `TikTok token refresh failed: ${tokenResponse.error_description ?? tokenResponse.error ?? "unknown error"}`
      );
    }

    await prisma.oauthCredential.update({
      where: { id: credential.id },
      data: {
        accessTokenEncrypted: encryptToken(tokenResponse.access_token),
        refreshTokenEncrypted: tokenResponse.refresh_token
          ? encryptToken(tokenResponse.refresh_token)
          : credential.refreshTokenEncrypted,
        tokenType: tokenResponse.token_type ?? credential.tokenType,
        scopes: tokenResponse.scope ? tokenResponse.scope.split(/[ ,]+/).filter(Boolean) : credential.scopes,
        expiresAt: tokenResponse.expires_in
          ? new Date(Date.now() + tokenResponse.expires_in * 1000)
          : credential.expiresAt
      }
    });

    return tokenResponse.access_token;
  }

  private async refreshAccessToken(refreshToken: string) {
    const response = await fetch(`${tiktokApiBaseUrl}/v2/oauth/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_key: config.TIKTOK_CLIENT_ID,
        client_secret: config.TIKTOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    });

    return (await response.json().catch(() => ({}))) as TikTokTokenResponse;
  }

  private async queryCreatorPublishInfo(accessToken: string): Promise<TikTokCreatorPublishInfo> {
    const response = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/creator_info/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      }
    });
    const payload = (await response.json().catch(() => null)) as TikTokCreatorInfoResponse | null;

    if (!response.ok || !payload || payload.error?.code !== "ok" || !payload.data) {
      throw new Error(`TikTok creator information request failed: ${describeTikTokError(payload?.error, response.statusText)}`);
    }

    const privacyLevelOptions = (payload.data.privacy_level_options ?? []).filter(isTikTokPrivacyLevel);
    if (!privacyLevelOptions.length) {
      throw new Error("TikTok did not return any privacy options for this account. Try again later.");
    }

    return {
      creatorUsername: payload.data.creator_username ?? "TikTok creator",
      creatorNickname: payload.data.creator_nickname ?? payload.data.creator_username ?? "TikTok creator",
      creatorAvatarUrl: payload.data.creator_avatar_url,
      privacyLevelOptions,
      commentDisabled: payload.data.comment_disabled === true,
      duetDisabled: payload.data.duet_disabled === true,
      stitchDisabled: payload.data.stitch_disabled === true,
      maxVideoPostDurationSec: payload.data.max_video_post_duration_sec,
      directPostAudited: config.TIKTOK_DIRECT_POST_AUDITED
    };
  }

  private async initializeDirectPost(
    accessToken: string,
    text: string,
    media: PublishMediaAsset,
    creatorInfo: TikTokCreatorPublishInfo,
    settings: TikTokPublishSettings
  ) {
    const mediaUrl = new URL(media.fileUrl);
    if (mediaUrl.protocol !== "https:") {
      throw new Error("TikTok needs an HTTPS media URL. Use the production site to publish TikTok videos.");
    }

    const response = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        post_info: {
          title: text.trim().slice(0, 2200),
          privacy_level: settings.privacyLevel,
          disable_comment: creatorInfo.commentDisabled || !settings.allowComment,
          disable_duet: creatorInfo.duetDisabled || !settings.allowDuet,
          disable_stitch: creatorInfo.stitchDisabled || !settings.allowStitch,
          brand_organic_toggle: settings.brandOrganic,
          is_aigc: settings.isAigc
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: media.fileUrl
        }
      })
    });
    const payload = (await response.json().catch(() => null)) as TikTokInitPublishResponse | null;

    if (!response.ok || !payload || payload.error?.code !== "ok" || !payload.data?.publish_id) {
      throw new Error(`TikTok video publish initialization failed: ${describeTikTokError(payload?.error, response.statusText)}`);
    }

    return payload.data.publish_id;
  }

  private async waitForPublishCompletion(accessToken: string, publishId: string) {
    for (let attempt = 0; attempt < maxPublishStatusChecks; attempt += 1) {
      const response = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/status/fetch/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify({ publish_id: publishId })
      });
      const payload = (await response.json().catch(() => null)) as TikTokPublishStatusResponse | null;

      if (!response.ok || !payload || payload.error?.code !== "ok" || !payload.data) {
        throw new Error(`TikTok publish status request failed: ${describeTikTokError(payload?.error, response.statusText)}`);
      }

      if (payload.data.status === "PUBLISH_COMPLETE") {
        return payload.data;
      }

      if (payload.data.status === "FAILED") {
        throw new Error(`TikTok video publishing failed: ${payload.data.fail_reason ?? "unknown error"}`);
      }

      await wait(publishStatusPollIntervalMs);
    }

    throw new Error("TikTok video is still processing. Check the TikTok account shortly before retrying.");
  }
}
