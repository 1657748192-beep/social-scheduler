import type { Platform } from "@prisma/client";

export type PublishInput = {
  platform: Platform;
  text: string;
  idempotencyKey: string;
};

export type PublishResult = {
  providerPostId: string;
  providerPermalink: string;
  rawResponse: Record<string, string | number | boolean | null>;
};

export interface SocialPublisher {
  platform: Platform;
  validate(input: PublishInput): Promise<void>;
  publish(input: PublishInput): Promise<PublishResult>;
}
