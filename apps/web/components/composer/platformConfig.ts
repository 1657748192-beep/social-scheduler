import type { ComposerPlatform, PlatformLimit, SocialAccount } from "../../lib/api";

export const platformLimits: Record<ComposerPlatform, PlatformLimit> = {
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
  }
};

export const composerPlatforms = Object.values(platformLimits);

export type ComposerSocialAccount = SocialAccount & { platform: ComposerPlatform };

export function isComposerPlatform(platform: SocialAccount["platform"]): platform is ComposerPlatform {
  return platform in platformLimits;
}
