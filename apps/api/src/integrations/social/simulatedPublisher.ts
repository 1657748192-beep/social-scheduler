import type { Platform } from "@prisma/client";
import type { PublishInput, PublishResult, SocialPublisher } from "./socialPublisher";

export class SimulatedPublisher implements SocialPublisher {
  constructor(public readonly platform: Platform) {}

  async validate(input: PublishInput) {
    if (!input.text.trim()) {
      throw new Error("Post text is required");
    }
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    await this.validate(input);

    const safeKey = input.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const providerPostId = `${input.platform}_${safeKey}`;

    return {
      providerPostId,
      providerPermalink: `https://example.com/${input.platform}/posts/${providerPostId}`,
      rawResponse: {
        platform: input.platform,
        simulated: true
      }
    };
  }
}
