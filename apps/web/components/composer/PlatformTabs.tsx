"use client";

import type { ComposerPlatform, SocialAccount } from "../../lib/api";
import { composerPlatforms } from "./platformConfig";

type PlatformTabsProps = {
  selected: ComposerPlatform[];
  active: ComposerPlatform;
  accountsByPlatform: Partial<Record<ComposerPlatform, SocialAccount>>;
  loading: boolean;
  onActiveChange: (platform: ComposerPlatform) => void;
  onToggle: (platform: ComposerPlatform) => void;
};

export function PlatformTabs({
  selected,
  active,
  accountsByPlatform,
  loading,
  onActiveChange,
  onToggle
}: PlatformTabsProps) {
  return (
    <div className="platform-tabs" aria-label="平台版本">
      {composerPlatforms.map((platform) => {
        const isSelected = selected.includes(platform.platform);
        const account = accountsByPlatform[platform.platform];
        const accountStatus = loading ? "正在读取账号" : account?.displayName ?? "未绑定账号";
        return (
          <label
            className={`platform-tab ${active === platform.platform ? "active" : ""}`}
            key={platform.platform}
            onClick={() => {
              onActiveChange(platform.platform);
            }}
          >
            <span>
              <strong>{platform.label}</strong>
              <small>{platform.maxTextLength.toLocaleString()} 字以内</small>
              <small className={account ? "account-state bound" : "account-state"}>
                {accountStatus}
              </small>
            </span>
            <input
              aria-label={`启用 ${platform.label}`}
              checked={isSelected}
              onChange={() => onToggle(platform.platform)}
              type="checkbox"
            />
          </label>
        );
      })}
    </div>
  );
}
