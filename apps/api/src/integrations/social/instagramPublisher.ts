import type { OauthCredential, Platform, Prisma, SocialAccount } from "@prisma/client";
import { prisma } from "../../prisma";
import { decryptToken } from "../../utils/tokenCrypto";
import type { PublishInput, PublishMediaAsset, PublishResult, SocialPublisher } from "./socialPublisher";

const instagramApiBaseUrl = "https://graph.instagram.com/v20.0";
const containerPollIntervalMs = 2_000;
const maxContainerStatusChecks = 180;

type InstagramAccount = SocialAccount & {
  credential: OauthCredential | null;
};

type InstagramApiError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
};

type InstagramApiResponse = {
  id?: string;
  permalink?: string;
  status_code?: string;
  status?: string;
  error?: InstagramApiError;
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function describeInstagramError(error: InstagramApiError | undefined, fallback: string) {
  if (!error) {
    return fallback;
  }

  return error.error_user_msg || error.error_user_title || error.message || fallback;
}

export class InstagramPublisher implements SocialPublisher {
  platform: Platform = "instagram";

  async validate(input: PublishInput) {
    if (!input.media.length) {
      throw new Error("Instagram publishing requires at least one image or video");
    }

    if (input.media.length > 10) {
      throw new Error("Instagram publishing supports up to 10 images in one carousel");
    }

    const imageAssets = input.media.filter((asset) => asset.mimeType.startsWith("image/"));
    const videoAssets = input.media.filter((asset) => asset.mimeType.startsWith("video/"));

    if (imageAssets.length + videoAssets.length !== input.media.length) {
      throw new Error("Instagram only supports image or video media");
    }

    if (videoAssets.length) {
      if (input.media.length !== 1) {
        throw new Error("Instagram video publishing supports one video per post in this version");
      }

      if (!["video/mp4", "video/quicktime"].includes(videoAssets[0].mimeType.toLowerCase())) {
        throw new Error("Instagram videos must be MP4 or MOV files");
      }

      return;
    }

    const unsupportedImage = imageAssets.find((asset) => asset.mimeType.toLowerCase() !== "image/jpeg");
    if (unsupportedImage) {
      throw new Error("Instagram images must be JPG/JPEG files. Convert PNG, WEBP, or GIF before publishing.");
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const account = await this.findInstagramAccount(input.workspaceId, input.socialAccountId);
    if (!account?.credential) {
      throw new Error("The selected Instagram account is unavailable. Reconnect it and select it again before publishing.");
    }

    if (!account.credential.scopes.includes("instagram_business_content_publish")) {
      throw new Error(
        "Instagram publishing permission is missing. Reconnect the account and approve instagram_business_content_publish."
      );
    }

    if (account.credential.expiresAt && account.credential.expiresAt.getTime() <= Date.now()) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: "token_expired" }
      });
      throw new Error("Instagram authorization has expired. Reconnect the account before publishing.");
    }

    const accessToken = decryptToken(account.credential.accessTokenEncrypted);
    const imageAssets = input.media.filter((asset) => asset.mimeType.startsWith("image/"));
    const videoAsset = input.media.find((asset) => asset.mimeType.startsWith("video/"));
    const containerId = videoAsset
      ? await this.createReelContainer(account, accessToken, input, videoAsset)
      : await this.createImageContainer(account, accessToken, input, imageAssets);

    await this.waitForContainer(account, accessToken, containerId);
    const publishedMediaId = await this.publishContainer(account, accessToken, containerId);
    const permalink = await this.getPublishedPermalink(account, accessToken, publishedMediaId);

    return {
      providerPostId: publishedMediaId,
      providerPermalink: permalink ?? undefined,
      rawResponse: {
        platform: "instagram",
        type: videoAsset ? "reel" : imageAssets.length > 1 ? "carousel" : "image",
        instagramAccountId: account.providerAccountId,
        socialAccountId: account.id,
        providerPostId: publishedMediaId,
        containerId,
        mediaAssetIds: input.media.map((asset) => asset.id)
      } as Prisma.InputJsonObject
    };
  }

  private async findInstagramAccount(workspaceId: string, socialAccountId: string) {
    return prisma.socialAccount.findFirst({
      where: {
        id: socialAccountId,
        workspaceId,
        platform: "instagram",
        status: "active"
      },
      include: {
        credential: true
      }
    });
  }

  private async createImageContainer(
    account: InstagramAccount,
    accessToken: string,
    input: PublishInput,
    imageAssets: PublishMediaAsset[]
  ) {
    if (imageAssets.length === 1) {
      return this.createMediaContainer(account, accessToken, {
        image_url: imageAssets[0].fileUrl,
        caption: input.text.trim()
      });
    }

    const childIds: string[] = [];
    for (const image of imageAssets) {
      const childId = await this.createMediaContainer(account, accessToken, {
        image_url: image.fileUrl,
        is_carousel_item: "true"
      });
      await this.waitForContainer(account, accessToken, childId);
      childIds.push(childId);
    }

    return this.createMediaContainer(account, accessToken, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: input.text.trim()
    });
  }

  private async createReelContainer(
    account: InstagramAccount,
    accessToken: string,
    input: PublishInput,
    video: PublishMediaAsset
  ) {
    return this.createMediaContainer(account, accessToken, {
      media_type: "REELS",
      video_url: video.fileUrl,
      caption: input.text.trim(),
      share_to_feed: "true"
    });
  }

  private async createMediaContainer(
    account: InstagramAccount,
    accessToken: string,
    values: Record<string, string>
  ) {
    const payload = await this.postForm(
      `/${account.providerAccountId}/media`,
      accessToken,
      values,
      "Instagram media container creation failed"
    );

    if (!payload.id) {
      throw new Error("Instagram media container creation failed: no container id was returned");
    }

    return payload.id;
  }

  private async waitForContainer(account: InstagramAccount, accessToken: string, containerId: string) {
    for (let attempt = 0; attempt < maxContainerStatusChecks; attempt += 1) {
      const payload = await this.getJson(
        `/${containerId}?fields=status_code,status`,
        accessToken,
        "Instagram media processing status check failed"
      );
      const status = (payload.status_code || payload.status || "").toUpperCase();

      if (status === "FINISHED" || status === "PUBLISHED") {
        return;
      }

      if (status === "ERROR" || status === "EXPIRED") {
        throw new Error(
          `Instagram media processing failed: ${describeInstagramError(payload.error, "the media could not be processed")}`
        );
      }

      await wait(containerPollIntervalMs);
    }

    throw new Error("Instagram media processing timed out. Keep the source media URL available and try again.");
  }

  private async publishContainer(account: InstagramAccount, accessToken: string, containerId: string) {
    const payload = await this.postForm(
      `/${account.providerAccountId}/media_publish`,
      accessToken,
      { creation_id: containerId },
      "Instagram publish failed"
    );

    if (!payload.id) {
      throw new Error("Instagram publish failed: no media id was returned");
    }

    return payload.id;
  }

  private async getPublishedPermalink(account: InstagramAccount, accessToken: string, mediaId: string) {
    try {
      const payload = await this.getJson(
        `/${mediaId}?fields=id,permalink`,
        accessToken,
        "Instagram permalink lookup failed"
      );
      return payload.permalink || null;
    } catch {
      return null;
    }
  }

  private async postForm(
    path: string,
    accessToken: string,
    values: Record<string, string>,
    errorPrefix: string
  ) {
    const response = await fetch(`${instagramApiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(values)
    });
    const payload = (await response.json().catch(() => null)) as InstagramApiResponse | null;

    if (!response.ok || !payload) {
      throw new Error(`${errorPrefix}: ${describeInstagramError(payload?.error, response.statusText)}`);
    }

    return payload;
  }

  private async getJson(path: string, accessToken: string, errorPrefix: string) {
    const response = await fetch(`${instagramApiBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const payload = (await response.json().catch(() => null)) as InstagramApiResponse | null;

    if (!response.ok || !payload) {
      throw new Error(`${errorPrefix}: ${describeInstagramError(payload?.error, response.statusText)}`);
    }

    return payload;
  }
}
