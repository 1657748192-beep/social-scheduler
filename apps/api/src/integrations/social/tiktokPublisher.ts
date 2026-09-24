import type { Platform, Prisma } from "@prisma/client";
import { config } from "../../config";
import { prisma } from "../../prisma";
import type { PublishInput, PublishMediaAsset, PublishResult, SocialPublisher } from "./socialPublisher";
import { getTikTokAccountAccessToken, markTikTokAccountStatus } from "./tiktokCredentialService";
import { classifyTikTokApiFailure } from "./tiktokTokenRefresh";
import { PublishOutcomeUnknownError } from "./publishOutcomeError";

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

export function tiktokProfilePermalink(creatorUsername: string) {
  const normalizedUsername = creatorUsername.trim().replace(/^@+/, "");

  if (!normalizedUsername) {
    return undefined;
  }

  return `https://www.tiktok.com/@${encodeURIComponent(normalizedUsername)}`;
}

export function tiktokPublicPostPermalink(
  creatorUsername: string,
  publiclyAvailablePostIds: Array<string | number> | undefined
) {
  const postId = publiclyAvailablePostIds?.[0];
  const profilePermalink = tiktokProfilePermalink(creatorUsername);

  if (!postId || !profilePermalink) {
    return undefined;
  }

  return `${profilePermalink}/video/${encodeURIComponent(postId.toString())}`;
}

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

    const accessToken = await getTikTokAccountAccessToken(account.id, "video.publish");
    return this.queryCreatorPublishInfo(account.id, accessToken);
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const account = await this.findTikTokAccount(input.workspaceId, input.socialAccountId);
    if (!account?.credential) {
      throw new Error("The selected TikTok account is unavailable. Reconnect it and select it again before publishing.");
    }

    const settings = readTikTokPublishSettings(input.platformPayload)!;
    const accessToken = await getTikTokAccountAccessToken(account.id, "video.publish");
    const creatorInfo = await this.queryCreatorPublishInfo(account.id, accessToken);

    if (!creatorInfo.privacyLevelOptions.includes(settings.privacyLevel)) {
      throw new Error("TikTok privacy options changed. Open the TikTok platform settings and choose a privacy option again.");
    }

    if (!creatorInfo.directPostAudited && settings.privacyLevel !== "SELF_ONLY") {
      throw new Error("This TikTok app is not approved yet, so videos can only be posted as Only me (private).");
    }

    const video = input.media[0];
    const publishId = await this.initializeDirectPost(account.id, accessToken, input.text, video, creatorInfo, settings);
    const status = await this.waitForPublishCompletion(accessToken, publishId);
    const providerPostId = status.publicaly_available_post_id?.[0]?.toString() ?? publishId;
    const providerPermalink = tiktokPublicPostPermalink(
      creatorInfo.creatorUsername,
      status.publicaly_available_post_id
    );

    return {
      providerPostId,
      providerPermalink,
      rawResponse: {
        platform: "tiktok",
        type: "video",
        tiktokAccountId: account.providerAccountId,
        socialAccountId: account.id,
        creatorUsername: creatorInfo.creatorUsername,
        publishId,
        providerPostId,
        providerPermalink,
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
        status: { in: ["active", "token_expired"] },
        accountType: "profile"
      },
      include: {
        credential: true
      }
    });
  }

  private async queryCreatorPublishInfo(accountId: string, accessToken: string): Promise<TikTokCreatorPublishInfo> {
    const response = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/creator_info/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      }
    });
    const payload = (await response.json().catch(() => null)) as TikTokCreatorInfoResponse | null;

    if (!response.ok || !payload || payload.error?.code !== "ok" || !payload.data) {
      if (classifyTikTokApiFailure(response.status, payload?.error?.code) === "permission_missing") {
        await markTikTokAccountStatus(accountId, "permission_missing", accessToken);
      }
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
    accountId: string,
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

    let response: Response;
    try {
      response = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/video/init/`, {
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
    } catch {
      throw new PublishOutcomeUnknownError("TikTok");
    }
    const payload = (await response.json().catch(() => null)) as TikTokInitPublishResponse | null;

    if (!response.ok || !payload || payload.error?.code !== "ok" || !payload.data?.publish_id) {
      if (response.status >= 500 || !payload?.error?.code || payload.error.code === "ok") {
        throw new PublishOutcomeUnknownError("TikTok");
      }
      if (classifyTikTokApiFailure(response.status, payload?.error?.code) === "permission_missing") {
        await markTikTokAccountStatus(accountId, "permission_missing", accessToken);
      }
      throw new Error(`TikTok video publish initialization failed: ${describeTikTokError(payload?.error, response.statusText)}`);
    }

    return payload.data.publish_id;
  }

  private async waitForPublishCompletion(accessToken: string, publishId: string) {
    for (let attempt = 0; attempt < maxPublishStatusChecks; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${tiktokApiBaseUrl}/v2/post/publish/status/fetch/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8"
          },
          body: JSON.stringify({ publish_id: publishId })
        });
      } catch {
        throw new PublishOutcomeUnknownError("TikTok");
      }
      const payload = (await response.json().catch(() => null)) as TikTokPublishStatusResponse | null;

      if (!response.ok || !payload || payload.error?.code !== "ok" || !payload.data) {
        if (response.status >= 500 || !payload?.error?.code || payload.error.code === "ok") {
          throw new PublishOutcomeUnknownError("TikTok");
        }
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

    throw new PublishOutcomeUnknownError("TikTok");
  }
}
