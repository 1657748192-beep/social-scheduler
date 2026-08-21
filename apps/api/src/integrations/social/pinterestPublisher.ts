import type { OauthCredential, Platform, Prisma, SocialAccount } from "@prisma/client";
import { prisma } from "../../prisma";
import { decryptToken } from "../../utils/tokenCrypto";
import {
  buildPinterestCreatePinBody,
  describePinterestApiError,
  getPinterestPinValidationError,
  loadPinterestBoardPages,
  pinterestPinPermalink,
  readPinterestPinSettings,
  type PinterestApiError,
  type PinterestBoardPage
} from "./pinterestPublishing";
import type { PublishInput, PublishResult, SocialPublisher } from "./socialPublisher";

const pinterestApiBaseUrl = "https://api.pinterest.com/v5";
type PinterestPinResponse = {
  id?: string;
  code?: string | number;
  message?: string;
};

type PinterestAccount = SocialAccount & {
  credential: OauthCredential | null;
};

export class PinterestPublisher implements SocialPublisher {
  platform: Platform = "pinterest";

  async validate(input: PublishInput) {
    const validationError = getPinterestPinValidationError(input.platformPayload, input.media, input.text.trim());

    if (validationError) {
      throw new Error(validationError);
    }
  }

  async listBoards(workspaceId: string, socialAccountId: string) {
    const account = await this.findPinterestAccount(workspaceId, socialAccountId);
    const accessToken = await this.getAccessToken(account, "boards:read", "list Pinterest boards");

    return loadPinterestBoardPages(async (bookmark) => {
      const url = new URL(`${pinterestApiBaseUrl}/boards`);
      url.searchParams.set("page_size", "100");
      if (bookmark) {
        url.searchParams.set("bookmark", bookmark);
      }

      return this.getJson<PinterestBoardPage>(url.toString(), accessToken, "Pinterest board lookup failed");
    });
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const account = await this.findPinterestAccount(input.workspaceId, input.socialAccountId);
    const accessToken = await this.getAccessToken(account, "pins:write", "publish a Pinterest Pin");

    if (!account) {
      throw new Error("The selected Pinterest account is unavailable. Reconnect it and select it again before publishing.");
    }

    const settings = readPinterestPinSettings(input.platformPayload);
    const image = input.media[0];

    if (!settings || !image) {
      throw new Error("Pinterest publishing settings are incomplete.");
    }

    const response = await fetch(`${pinterestApiBaseUrl}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildPinterestCreatePinBody(settings, input.text.trim(), image.fileUrl))
    });
    const payload = (await response.json().catch(() => ({}))) as PinterestPinResponse;

    if (!response.ok || !payload.id) {
      throw new Error(describePinterestApiError(payload, `Pinterest Pin publishing failed (${response.status}).`));
    }

    return {
      providerPostId: payload.id,
      providerPermalink: pinterestPinPermalink(payload.id),
      rawResponse: {
        platform: "pinterest",
        socialAccountId: account.id,
        pinterestAccountId: account.providerAccountId,
        providerPostId: payload.id,
        boardId: settings.boardId,
        mediaAssetIds: [image.id]
      } as Prisma.InputJsonObject
    };
  }

  private async findPinterestAccount(workspaceId: string, socialAccountId: string) {
    return prisma.socialAccount.findFirst({
      where: {
        id: socialAccountId,
        workspaceId,
        platform: "pinterest",
        status: "active"
      },
      include: {
        credential: true
      }
    });
  }

  private async getAccessToken(
    account: PinterestAccount | null,
    requiredScope: string,
    action: string
  ) {
    const credential = account?.credential;

    if (!account || !credential) {
      throw new Error(`The selected Pinterest account is unavailable. Reconnect it and select it again before you ${action}.`);
    }

    if (!credential.scopes.includes(requiredScope)) {
      throw new Error(`Pinterest permission ${requiredScope} is missing. Reconnect the account and approve it before you ${action}.`);
    }

    if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: "token_expired" }
      });
      throw new Error("Pinterest authorization has expired. Reconnect the account before publishing.");
    }

    return decryptToken(credential.accessTokenEncrypted);
  }

  private async getJson<T>(url: string, accessToken: string, fallback: string) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const payload = (await response.json().catch(() => ({}))) as T & PinterestApiError;

    if (!response.ok) {
      throw new Error(describePinterestApiError(payload, `${fallback} (${response.status}).`));
    }

    return payload;
  }
}
