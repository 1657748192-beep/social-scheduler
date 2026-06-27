import type { Platform } from "@prisma/client";

export type ComposerPlatform = Extract<Platform, "x" | "instagram" | "facebook">;

export type PlatformLimit = {
  platform: ComposerPlatform;
  label: string;
  maxTextLength: number;
  maxImages: number;
};

export const composerPlatformLimits: Record<ComposerPlatform, PlatformLimit> = {
  x: {
    platform: "x",
    label: "Twitter / X",
    maxTextLength: 280,
    maxImages: 4
  },
  instagram: {
    platform: "instagram",
    label: "Instagram",
    maxTextLength: 2200,
    maxImages: 10
  },
  facebook: {
    platform: "facebook",
    label: "Facebook",
    maxTextLength: 63206,
    maxImages: 10
  }
};

export function getComposerPlatformLimit(platform: ComposerPlatform) {
  return composerPlatformLimits[platform];
}

export function isComposerPlatform(platform: Platform): platform is ComposerPlatform {
  return platform === "x" || platform === "instagram" || platform === "facebook";
}
