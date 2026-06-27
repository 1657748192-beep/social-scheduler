import type { Platform } from "@prisma/client";
import { SimulatedPublisher } from "./simulatedPublisher";
import type { SocialPublisher } from "./socialPublisher";

const publishers = new Map<Platform, SocialPublisher>();

export function getSocialPublisher(platform: Platform) {
  if (!publishers.has(platform)) {
    publishers.set(platform, new SimulatedPublisher(platform));
  }

  return publishers.get(platform)!;
}
