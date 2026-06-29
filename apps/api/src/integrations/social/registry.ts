import type { Platform } from "@prisma/client";
import { FacebookPagePublisher } from "./facebookPagePublisher";
import { SimulatedPublisher } from "./simulatedPublisher";
import type { SocialPublisher } from "./socialPublisher";
import { YouTubePublisher } from "./youtubePublisher";

const publishers = new Map<Platform, SocialPublisher>();

export function getSocialPublisher(platform: Platform) {
  if (!publishers.has(platform)) {
    if (platform === "facebook") {
      publishers.set(platform, new FacebookPagePublisher());
    } else if (platform === "youtube") {
      publishers.set(platform, new YouTubePublisher());
    } else {
      publishers.set(platform, new SimulatedPublisher(platform));
    }
  }

  return publishers.get(platform)!;
}
