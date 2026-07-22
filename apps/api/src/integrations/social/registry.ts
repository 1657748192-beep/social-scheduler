import type { Platform } from "@prisma/client";
import { FacebookPagePublisher } from "./facebookPagePublisher";
import { InstagramPublisher } from "./instagramPublisher";
import type { SocialPublisher } from "./socialPublisher";
import { YouTubePublisher } from "./youtubePublisher";

const publishers = new Map<Platform, SocialPublisher>();
const realPublishingPlatforms: Platform[] = ["instagram", "facebook", "youtube"];

export function isRealPublishingSupported(platform: Platform) {
  return realPublishingPlatforms.includes(platform);
}

export function getSocialPublisher(platform: Platform) {
  if (!isRealPublishingSupported(platform)) {
    throw new Error(`Real publishing is not supported for ${platform} yet. Save this content as a draft instead.`);
  }

  if (!publishers.has(platform)) {
    if (platform === "instagram") {
      publishers.set(platform, new InstagramPublisher());
    } else if (platform === "facebook") {
      publishers.set(platform, new FacebookPagePublisher());
    } else if (platform === "youtube") {
      publishers.set(platform, new YouTubePublisher());
    }
  }

  return publishers.get(platform)!;
}
