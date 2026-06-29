import type { OauthCredential, Platform, Prisma, SocialAccount } from "@prisma/client";
import { config } from "../../config";
import { prisma } from "../../prisma";
import { decryptToken, encryptToken } from "../../utils/tokenCrypto";
import type { PublishInput, PublishMediaAsset, PublishResult, SocialPublisher } from "./socialPublisher";

type YouTubeAccount = SocialAccount & {
  credential: OauthCredential | null;
};

type YouTubeTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

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

    const account = await this.findChannelAccount(input.workspaceId);

    if (!account?.credential) {
      throw new Error("No connected YouTube channel is available for this workspace");
    }

    const accessToken = await this.getAccessToken(account);
    const videoAsset = input.media.find((asset) => asset.mimeType.startsWith("video/"))!;
    const videoBuffer = await this.fetchMediaBuffer(videoAsset);
    const metadata = this.buildVideoMetadata(input);
    const uploadUrl = await this.createUploadSession(accessToken, videoAsset, videoBuffer.length, metadata);
    const payload = await this.uploadVideo(uploadUrl, videoAsset, videoBuffer);

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

  private async findChannelAccount(workspaceId: string) {
    return prisma.socialAccount.findFirst({
      where: {
        workspaceId,
        platform: "youtube",
        status: "active",
        accountType: "channel"
      },
      include: {
        credential: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  private async getAccessToken(account: YouTubeAccount) {
    const credential = account.credential;

    if (!credential) {
      throw new Error("YouTube credential is missing");
    }

    const expiresSoon = credential.expiresAt
      ? credential.expiresAt.getTime() <= Date.now() + 60 * 1000
      : false;

    if (!expiresSoon) {
      return decryptToken(credential.accessTokenEncrypted);
    }

    if (!credential.refreshTokenEncrypted) {
      throw new Error("YouTube access token expired. Reconnect YouTube to refresh permissions.");
    }

    const refreshToken = decryptToken(credential.refreshTokenEncrypted);
    const tokenResponse = await this.refreshAccessToken(refreshToken);

    if (!tokenResponse.access_token) {
      throw new Error(
        `YouTube token refresh failed: ${tokenResponse.error_description ?? tokenResponse.error ?? "unknown error"}`
      );
    }

    await prisma.oauthCredential.update({
      where: {
        id: credential.id
      },
      data: {
        accessTokenEncrypted: encryptToken(tokenResponse.access_token),
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
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: config.YOUTUBE_CLIENT_ID,
        client_secret: config.YOUTUBE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });

    return (await response.json().catch(() => ({}))) as YouTubeTokenResponse;
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

  private async fetchMediaBuffer(media: PublishMediaAsset) {
    const response = await fetch(media.fileUrl);

    if (!response.ok) {
      throw new Error(`Unable to download video for YouTube upload: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private async createUploadSession(
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
      const message = payload?.error?.message ?? response.statusText;
      throw new Error(`YouTube upload session failed: ${message}`);
    }

    return location;
  }

  private async uploadVideo(uploadUrl: string, media: PublishMediaAsset, videoBuffer: Buffer) {
    const uploadBody = videoBuffer.buffer.slice(
      videoBuffer.byteOffset,
      videoBuffer.byteOffset + videoBuffer.byteLength
    ) as ArrayBuffer;

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(videoBuffer.length)
      },
      body: uploadBody
    });
    const payload = (await response.json().catch(() => null)) as YouTubeVideoResponse | null;

    if (!response.ok || !payload?.id) {
      const message = payload?.error?.message ?? response.statusText;
      throw new Error(`YouTube video upload failed: ${message}`);
    }

    return payload;
  }
}
