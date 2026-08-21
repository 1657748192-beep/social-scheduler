import type { Platform } from "@prisma/client";
import { FacebookPagePublisher } from "./facebookPagePublisher";
import { InstagramPublisher } from "./instagramPublisher";
import { PinterestPublisher } from "./pinterestPublisher";
import type { SocialPublisher } from "./socialPublisher";
import { TikTokPublisher } from "./tiktokPublisher";
import { YouTubePublisher } from "./youtubePublisher";

const publishers = new Map<Platform, SocialPublisher>();
const realPublishingPlatforms: Platform[] = ["instagram", "facebook", "youtube", "tiktok", "pinterest"];

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
    } else if (platform === "tiktok") {
      publishers.set(platform, new TikTokPublisher());
    } else if (platform === "pinterest") {
      publishers.set(platform, new PinterestPublisher());
    }
  }

  return publishers.get(platform)!;
}
