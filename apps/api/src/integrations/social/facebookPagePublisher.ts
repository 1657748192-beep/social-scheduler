import type { Platform } from "@prisma/client";
import { prisma } from "../../prisma";
import { decryptToken } from "../../utils/tokenCrypto";
import type { PublishInput, PublishMediaAsset, PublishResult, SocialPublisher } from "./socialPublisher";

type FacebookPostResponse = {
  id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
};

type FacebookPageAccount = NonNullable<
  Awaited<ReturnType<FacebookPagePublisher["findPageAccount"]>>
>;

export class FacebookPagePublisher implements SocialPublisher {
  platform: Platform = "facebook";

  async validate(input: PublishInput) {
    if (!input.text.trim() && !input.media.length) {
      throw new Error("Post text or media is required");
    }

    const unsupportedMedia = input.media.find(
      (asset) => !asset.mimeType.startsWith("image/") && !asset.mimeType.startsWith("video/")
    );

    if (unsupportedMedia) {
      throw new Error(`Unsupported Facebook media type: ${unsupportedMedia.mimeType}`);
    }

    const videoCount = input.media.filter((asset) => asset.mimeType.startsWith("video/")).length;

    if (videoCount > 1) {
      throw new Error("Facebook video publishing supports one video per post in this MVP");
    }

    if (videoCount && input.media.length > 1) {
      throw new Error("Facebook video publishing cannot be mixed with images in this MVP");
    }
  }

  async findPageAccount(workspaceId: string) {
    return prisma.socialAccount.findFirst({
      where: {
        workspaceId,
        platform: "facebook",
        status: "active",
        accountType: "page"
      },
      include: {
        credential: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const account = await this.findPageAccount(input.workspaceId);

    if (!account?.credential) {
      const basicAccount = await prisma.socialAccount.findFirst({
        where: {
          workspaceId: input.workspaceId,
          platform: "facebook",
          status: "active"
        }
      });

      if (basicAccount) {
        throw new Error(
          "Facebook is connected in basic mode only. To publish to a Page, approve pages_show_list, pages_read_engagement and pages_manage_posts in Meta, then reconnect Facebook."
        );
      }

      throw new Error("No connected Facebook Page is available for this workspace");
    }

    const pageAccessToken = decryptToken(account.credential.accessTokenEncrypted);
    const imageAssets = input.media.filter((asset) => asset.mimeType.startsWith("image/"));
    const videoAsset = input.media.find((asset) => asset.mimeType.startsWith("video/"));

    if (videoAsset) {
      return this.publishVideo(account, pageAccessToken, input, videoAsset);
    }

    if (imageAssets.length === 1) {
      return this.publishSinglePhoto(account, pageAccessToken, input, imageAssets[0]);
    }

    if (imageAssets.length > 1) {
      return this.publishPhotoFeed(account, pageAccessToken, input, imageAssets);
    }

    return this.publishTextPost(account, pageAccessToken, input);
  }

  private async publishTextPost(
    account: FacebookPageAccount,
    pageAccessToken: string,
    input: PublishInput
  ): Promise<PublishResult> {
    const body = new URLSearchParams({
      message: input.text,
      access_token: pageAccessToken
    });

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${account.providerAccountId}/feed`,
      {
        method: "POST",
        body
      }
    );
    const payload = (await response.json().catch(() => null)) as FacebookPostResponse | null;

    if (!response.ok || !payload?.id) {
      const message = payload?.error?.message ?? response.statusText;
      throw new Error(`Facebook publish failed: ${message}`);
    }

    return {
      providerPostId: payload.id,
      providerPermalink: `https://www.facebook.com/${payload.id}`,
      rawResponse: {
        platform: "facebook",
        pageId: account.providerAccountId,
        socialAccountId: account.id,
        providerPostId: payload.id
      }
    };
  }

  private async publishSinglePhoto(
    account: FacebookPageAccount,
    pageAccessToken: string,
    input: PublishInput,
    media: PublishMediaAsset
  ): Promise<PublishResult> {
    const body = new URLSearchParams({
      url: media.fileUrl,
      access_token: pageAccessToken
    });

    if (input.text.trim()) {
      body.set("message", input.text);
    }

    const payload = await this.postToFacebook(
      `https://graph.facebook.com/v20.0/${account.providerAccountId}/photos`,
      body,
      "Facebook photo publish failed"
    );

    return {
      providerPostId: payload.id!,
      providerPermalink: `https://www.facebook.com/${payload.id}`,
      rawResponse: {
        platform: "facebook",
        type: "photo",
        pageId: account.providerAccountId,
        socialAccountId: account.id,
        providerPostId: payload.id,
        mediaAssetIds: [media.id]
      }
    };
  }

  private async publishPhotoFeed(
    account: FacebookPageAccount,
    pageAccessToken: string,
    input: PublishInput,
    mediaAssets: PublishMediaAsset[]
  ): Promise<PublishResult> {
    const photoIds: string[] = [];

    for (const media of mediaAssets) {
      const photoBody = new URLSearchParams({
        url: media.fileUrl,
        published: "false",
        access_token: pageAccessToken
      });

      const photoPayload = await this.postToFacebook(
        `https://graph.facebook.com/v20.0/${account.providerAccountId}/photos`,
        photoBody,
        "Facebook photo upload failed"
      );

      photoIds.push(photoPayload.id!);
    }

    const feedBody = new URLSearchParams({
      message: input.text,
      access_token: pageAccessToken
    });

    photoIds.forEach((photoId, index) => {
      feedBody.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: photoId }));
    });

    const feedPayload = await this.postToFacebook(
      `https://graph.facebook.com/v20.0/${account.providerAccountId}/feed`,
      feedBody,
      "Facebook multi-photo publish failed"
    );

    return {
      providerPostId: feedPayload.id!,
      providerPermalink: `https://www.facebook.com/${feedPayload.id}`,
      rawResponse: {
        platform: "facebook",
        type: "multi_photo",
        pageId: account.providerAccountId,
        socialAccountId: account.id,
        providerPostId: feedPayload.id,
        photoIds,
        mediaAssetIds: mediaAssets.map((media) => media.id)
      }
    };
  }

  private async publishVideo(
    account: FacebookPageAccount,
    pageAccessToken: string,
    input: PublishInput,
    media: PublishMediaAsset
  ): Promise<PublishResult> {
    const body = new URLSearchParams({
      file_url: media.fileUrl,
      access_token: pageAccessToken
    });

    if (input.text.trim()) {
      body.set("description", input.text);
    }

    const payload = await this.postToFacebook(
      `https://graph.facebook.com/v20.0/${account.providerAccountId}/videos`,
      body,
      "Facebook video publish failed"
    );

    return {
      providerPostId: payload.id!,
      providerPermalink: `https://www.facebook.com/${payload.id}`,
      rawResponse: {
        platform: "facebook",
        type: "video",
        pageId: account.providerAccountId,
        socialAccountId: account.id,
        providerPostId: payload.id,
        mediaAssetIds: [media.id]
      }
    };
  }

  private async postToFacebook(
    url: string,
    body: URLSearchParams,
    errorPrefix: string
  ): Promise<FacebookPostResponse> {
    const response = await fetch(url, {
      method: "POST",
      body
    });
    const payload = (await response.json().catch(() => null)) as FacebookPostResponse | null;

    if (!response.ok || !payload?.id) {
      const message = payload?.error?.message ?? response.statusText;
      throw new Error(`${errorPrefix}: ${message}`);
    }

    return payload;
  }
}
