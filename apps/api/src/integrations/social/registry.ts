import type { Platform } from "@prisma/client";
import { FacebookPagePublisher } from "./facebookPagePublisher";
import { SimulatedPublisher } from "./simulatedPublisher";
import type { SocialPublisher } from "./socialPublisher";

const publishers = new Map<Platform, SocialPublisher>();

export function getSocialPublisher(platform: Platform) {
  if (!publishers.has(platform)) {
    publishers.set(platform, platform === "facebook" ? new FacebookPagePublisher() : new SimulatedPublisher(platform));
  }

  return publishers.get(platform)!;
}
