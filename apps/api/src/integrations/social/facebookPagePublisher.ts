import type { Platform } from "@prisma/client";
import { prisma } from "../../prisma";
import { decryptToken } from "../../utils/tokenCrypto";
import type { PublishInput, PublishResult, SocialPublisher } from "./socialPublisher";

type FacebookPostResponse = {
  id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
};

export class FacebookPagePublisher implements SocialPublisher {
  platform: Platform = "facebook";

  async validate(input: PublishInput) {
    if (!input.text.trim()) {
      throw new Error("Post text is required");
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const account = await prisma.socialAccount.findFirst({
      where: {
        workspaceId: input.workspaceId,
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

    if (!account?.credential) {
      throw new Error("No connected Facebook Page is available for this workspace");
    }

    const pageAccessToken = decryptToken(account.credential.accessTokenEncrypted);
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
}
