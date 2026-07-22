"use client";

import type { ComposerPlatform } from "../../lib/api";
import { platformLimits } from "./platformConfig";

type PlatformTabsProps = {
  platforms: ComposerPlatform[];
  active: ComposerPlatform;
  accountCountByPlatform: Partial<Record<ComposerPlatform, number>>;
  onActiveChange: (platform: ComposerPlatform) => void;
};

export function PlatformTabs({ platforms, active, accountCountByPlatform, onActiveChange }: PlatformTabsProps) {
  if (!platforms.length) {
    return null;
  }

  return (
    <div className="platform-tabs platform-version-tabs" aria-label="按平台编辑文案">
      {platforms.map((platform) => {
        const limit = platformLimits[platform];
        const accountCount = accountCountByPlatform[platform] ?? 0;

        return (
          <button
            className={`platform-tab ${active === platform ? "active" : ""}`}
            key={platform}
            onClick={() => onActiveChange(platform)}
            type="button"
          >
            <span>
              <strong>{limit.label}</strong>
              <small>{accountCount} 个目标账号 · {limit.maxTextLength.toLocaleString()} 字以内</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
