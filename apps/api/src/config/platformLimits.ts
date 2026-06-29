import type { Platform } from "@prisma/client";

export const composerPlatformOrder = [
  "instagram",
  "linkedin",
  "facebook",
  "youtube",
  "tiktok",
  "pinterest",
  "x"
] as const;

export type ComposerPlatform = (typeof composerPlatformOrder)[number];

export type PlatformLimit = {
  platform: ComposerPlatform;
  label: string;
  maxTextLength: number;
  maxImages: number;
};

export const composerPlatformLimits: Record<ComposerPlatform, PlatformLimit> = {
  instagram: {
    platform: "instagram",
    label: "Instagram",
    maxTextLength: 2200,
    maxImages: 10
  },
  linkedin: {
    platform: "linkedin",
    label: "LinkedIn",
    maxTextLength: 3000,
    maxImages: 9
  },
  facebook: {
    platform: "facebook",
    label: "Facebook",
    maxTextLength: 63206,
    maxImages: 10
  },
  youtube: {
    platform: "youtube",
    label: "YouTube",
    maxTextLength: 5000,
    maxImages: 1
  },
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    maxTextLength: 2200,
    maxImages: 1
  },
  pinterest: {
    platform: "pinterest",
    label: "Pinterest",
    maxTextLength: 500,
    maxImages: 1
  },
  x: {
    platform: "x",
    label: "Twitter / X",
    maxTextLength: 280,
    maxImages: 4
  }
};

export function getComposerPlatformLimit(platform: ComposerPlatform) {
  return composerPlatformLimits[platform];
}

export function isComposerPlatform(platform: Platform): platform is ComposerPlatform {
  return composerPlatformOrder.includes(platform as ComposerPlatform);
}
