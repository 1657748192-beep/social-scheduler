import type { Platform, Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import type { PublishInput, PublishMediaAsset, PublishResult, SocialPublisher } from "./socialPublisher";
import { getYouTubeAccountAccessToken, markYouTubeAccountStatus } from "./youtubeCredentialService";
import { classifyYouTubeFailure } from "./youtubeTokenRefresh";

type YouTubeVideoResponse = {
  id?: string;
  error?: {
    message?: string;
    code?: number;
    errors?: Array<{ message?: string; reason?: string }>;
  };
};

export class YouTubePublisher implements SocialPublisher {
  platform: Platform = "youtube";

  async validate(input: PublishInput) {
    const videoAssets = input.media.filter((asset) => asset.mimeType.startsWith("video/"));

    if (videoAssets.length !== 1) {
      throw new Error("YouTube publishing requires exactly one video asset");
    }

    const unsupportedMedia = input.media.find((asset) => !asset.mimeType.startsWith("video/"));

    if (unsupportedMedia) {
      throw new Error(`Unsupported YouTube media type: ${unsupportedMedia.mimeType}`);
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const account = await this.findChannelAccount(input.workspaceId, input.socialAccountId);

    if (!account?.credential) {
      throw new Error("The selected YouTube channel is unavailable. Reconnect that channel and select it again before publishing.");
    }

    const accessToken = await getYouTubeAccountAccessToken(account.id, "https://www.googleapis.com/auth/youtube.upload");
    const videoAsset = input.media.find((asset) => asset.mimeType.startsWith("video/"))!;
    const videoStream = await this.fetchMediaStream(videoAsset);
    const metadata = this.buildVideoMetadata(input);
    const uploadUrl = await this.createUploadSession(account.id, accessToken, videoAsset, videoAsset.sizeBytes, metadata);
    const payload = await this.uploadVideo(account.id, accessToken, uploadUrl, videoAsset, videoStream);

    return {
      providerPostId: payload.id!,
      providerPermalink: `https://youtu.be/${payload.id}`,
      rawResponse: {
        platform: "youtube",
        type: "video",
        channelId: account.providerAccountId,
        socialAccountId: account.id,
        providerPostId: payload.id,
        mediaAssetIds: [videoAsset.id]
      }
    };
  }

  private async findChannelAccount(workspaceId: string, socialAccountId: string) {
    return prisma.socialAccount.findFirst({
      where: {
        id: socialAccountId,
        workspaceId,
        platform: "youtube",
        status: "active",
        accountType: "channel"
      },
      include: {
        credential: true
      }
    });
  }

  private buildVideoMetadata(input: PublishInput): Prisma.InputJsonObject {
    const title = this.buildTitle(input.text);

    return {
      snippet: {
        title,
        description: input.text.trim() || title,
        categoryId: "22"
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false
      }
    };
  }

  private buildTitle(text: string) {
    const title = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return (title || "Untitled video").slice(0, 100);
  }

  private async fetchMediaStream(media: PublishMediaAsset) {
    const response = await fetch(media.fileUrl);

    if (!response.ok || !response.body) {
      throw new Error(`Unable to download video for YouTube upload: ${response.statusText}`);
    }

    return response.body;
  }

  private async createUploadSession(
    accountId: string,
    accessToken: string,
    media: PublishMediaAsset,
    contentLength: number,
    metadata: Prisma.InputJsonObject
  ) {
    const response = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(contentLength),
          "X-Upload-Content-Type": media.mimeType
        },
        body: JSON.stringify(metadata)
      }
    );

    const location = response.headers.get("location");

    if (!response.ok || !location) {
      const payload = (await response.json().catch(() => null)) as YouTubeVideoResponse | null;
      const failure = classifyYouTubeFailure(response.status, payload?.error?.errors?.[0]?.reason);
      if (failure === "authorization_invalid" || failure === "permission_missing") {
        await markYouTubeAccountStatus(accountId, failure, accessToken);
      }
      const message = payload?.error?.message ?? response.statusText;
      throw new Error(`YouTube upload session failed: ${message}`);
    }

    return location;
  }

  private async uploadVideo(accountId: string, accessToken: string, uploadUrl: string, media: PublishMediaAsset, videoStream: ReadableStream<Uint8Array>) {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(media.sizeBytes)
      },
      body: videoStream,
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    const payload = (await response.json().catch(() => null)) as YouTubeVideoResponse | null;

    if (!response.ok || !payload?.id) {
      const failure = classifyYouTubeFailure(response.status, payload?.error?.errors?.[0]?.reason);
      if (failure === "authorization_invalid" || failure === "permission_missing") {
        await markYouTubeAccountStatus(accountId, failure, accessToken);
      }
      const message = payload?.error?.message ?? response.statusText;
      throw new Error(`YouTube video upload failed: ${message}`);
    }

    return payload;
  }
}
