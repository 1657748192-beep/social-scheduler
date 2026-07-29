"use client";

import type { ComposerPlatform } from "../../lib/api";
import { platformLimits } from "./platformConfig";
import { useLanguage } from "../LanguageProvider";

type PlatformTabsProps = {
  platforms: ComposerPlatform[];
  active: ComposerPlatform;
  accountCountByPlatform: Partial<Record<ComposerPlatform, number>>;
  onActiveChange: (platform: ComposerPlatform) => void;
};

export function PlatformTabs({ platforms, active, accountCountByPlatform, onActiveChange }: PlatformTabsProps) {
  const { t } = useLanguage();
  if (!platforms.length) {
    return null;
  }

  return (
    <div className="platform-tabs platform-version-tabs" aria-label={t("按平台编辑文案", "Edit copy by platform")}>
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
              <small>{t(`${accountCount} 个目标账号 · ${limit.maxTextLength.toLocaleString()} 字以内`, `${accountCount} target accounts · up to ${limit.maxTextLength.toLocaleString()} characters`)}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
