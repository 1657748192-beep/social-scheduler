"use client";

import type { ComposerPlatform } from "../../lib/api";
import { composerPlatforms } from "./platformConfig";

type PlatformTabsProps = {
  selected: ComposerPlatform[];
  active: ComposerPlatform;
  onActiveChange: (platform: ComposerPlatform) => void;
  onToggle: (platform: ComposerPlatform) => void;
};

export function PlatformTabs({ selected, active, onActiveChange, onToggle }: PlatformTabsProps) {
  return (
    <div className="platform-tabs">
      {composerPlatforms.map((platform) => {
        const isSelected = selected.includes(platform.platform);
        return (
          <label
            className={`platform-tab ${active === platform.platform ? "active" : ""}`}
            key={platform.platform}
            onClick={() => {
              onActiveChange(platform.platform);
            }}
          >
            <span>{platform.label}</span>
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
