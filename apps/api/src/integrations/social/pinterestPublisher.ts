import type { Platform, Prisma, SocialAccount } from "@prisma/client";
import { config } from "../../config";
import { prisma } from "../../prisma";
import { getPinterestAccountAccessToken, markPinterestAccountStatus } from "./pinterestCredentialService";
import { assertPinterestAccountEnvironment, pinterestApiBaseUrl } from "./pinterestEnvironment";
import {
  buildPinterestCreateBoardBody,
  buildPinterestCreatePinBody,
  getPinterestPinValidationError,
  loadPinterestBoardPages,
  pinterestPinPermalink,
  readPinterestPinSettings,
  requestPinterestApi,
  type PinterestApiError,
  type PinterestBoard,
  type PinterestBoardPage
} from "./pinterestPublishing";
import type { PublishInput, PublishResult, SocialPublisher } from "./socialPublisher";

type PinterestPinResponse = {
  id?: string;
  code?: string | number;
  message?: string;
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
    assertPinterestAccountEnvironment(account?.capabilities, config.PINTEREST_API_ENV);
    return loadPinterestBoardPages(async (bookmark) => {
      const url = new URL(`${pinterestApiBaseUrl(config.PINTEREST_API_ENV)}/boards`);
      url.searchParams.set("page_size", "100");
      if (bookmark) {
        url.searchParams.set("bookmark", bookmark);
      }

      return this.requestJson<PinterestBoardPage>(account, "boards:read", url.toString(), "Pinterest board lookup failed");
    });
  }

  async createBoard(workspaceId: string, socialAccountId: string, name: string): Promise<PinterestBoard> {
    const account = await this.findPinterestAccount(workspaceId, socialAccountId);
    assertPinterestAccountEnvironment(account?.capabilities, config.PINTEREST_API_ENV);
    const payload = await this.requestJson<PinterestBoard & PinterestApiError>(
      account,
      "boards:write",
      `${pinterestApiBaseUrl(config.PINTEREST_API_ENV)}/boards`,
      "Pinterest board creation failed",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPinterestCreateBoardBody(name))
      }
    );

    if (!payload.id || !payload.name) {
      throw new Error("Pinterest board creation returned an incomplete response.");
    }

    return payload;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const account = await this.findPinterestAccount(input.workspaceId, input.socialAccountId);
    assertPinterestAccountEnvironment(account?.capabilities, config.PINTEREST_API_ENV);

    if (!account) {
      throw new Error("The selected Pinterest account is unavailable. Reconnect it and select it again before publishing.");
    }

    const settings = readPinterestPinSettings(input.platformPayload);
    const image = input.media[0];

    if (!settings || !image) {
      throw new Error("Pinterest publishing settings are incomplete.");
    }

    const payload = await this.requestJson<PinterestPinResponse>(
      account,
      "pins:write",
      `${pinterestApiBaseUrl(config.PINTEREST_API_ENV)}/pins`,
      "Pinterest Pin publishing failed",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPinterestCreatePinBody(settings, input.text.trim(), image.fileUrl))
      }
    );

    if (!payload.id) {
      throw new Error("Pinterest Pin publishing returned an incomplete response.");
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
    });
  }

  private async requestJson<T>(
    account: SocialAccount | null,
    requiredScope: string,
    url: string,
    fallback: string,
    options?: RequestInit
  ): Promise<T & PinterestApiError> {
    if (!account) {
      throw new Error("The selected Pinterest account is unavailable. Reconnect it before publishing.");
    }
    return requestPinterestApi<T>({
      fallback,
      getToken: (force) => getPinterestAccountAccessToken(account.id, requiredScope, force),
      send: (accessToken) => {
        const headers = new Headers(options?.headers);
        headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch(url, { ...options, headers });
      },
      setStatus: (status) => markPinterestAccountStatus(account.id, status)
    });
  }
}
