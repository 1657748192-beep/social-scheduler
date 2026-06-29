import type { Platform, Prisma } from "@prisma/client";

export type PublishInput = {
  workspaceId: string;
  platform: Platform;
  text: string;
  media: PublishMediaAsset[];
  idempotencyKey: string;
};

export type PublishMediaAsset = {
  id: string;
  fileUrl: string;
  mimeType: string;
};

export type PublishResult = {
  providerPostId: string;
  providerPermalink: string;
  rawResponse: Prisma.InputJsonValue;
};

export interface SocialPublisher {
  platform: Platform;
  validate(input: PublishInput): Promise<void>;
  publish(input: PublishInput): Promise<PublishResult>;
}
