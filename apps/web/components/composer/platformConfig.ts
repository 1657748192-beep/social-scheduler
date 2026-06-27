import type { ComposerPlatform, PlatformLimit } from "../../lib/api";

export const platformLimits: Record<ComposerPlatform, PlatformLimit> = {
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

export const composerPlatforms = Object.values(platformLimits);
