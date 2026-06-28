"use client";

import type { ComposerPlatform } from "../../lib/api";
import { platformLimits } from "./platformConfig";

type PlatformEditorProps = {
  platform: ComposerPlatform;
  text: string;
  mediaCount: number;
  onChange: (value: string) => void;
};

export function PlatformEditor({ platform, text, mediaCount, onChange }: PlatformEditorProps) {
  const limit = platformLimits[platform];
  const overTextLimit = text.length > limit.maxTextLength;
  const overMediaLimit = mediaCount > limit.maxImages;

  return (
    <section className="composer-panel editor-surface">
      <div className="row">
        <div>
          <p className="section-kicker">平台版本</p>
          <h2>{limit.label}</h2>
        </div>
        <span className={overTextLimit ? "counter danger" : "counter"}>
          {text.length}/{limit.maxTextLength}
        </span>
      </div>

      <textarea
        className="composer-textarea"
        onChange={(event) => onChange(event.target.value)}
        placeholder={`撰写 ${limit.label} 专属版本`}
        value={text}
      />

      <div className="validation-strip">
        <span className={overTextLimit ? "danger" : ""}>
          {overTextLimit ? "文案超过平台限制" : "文案长度正常"}
        </span>
        <span className={overMediaLimit ? "danger" : ""}>
          {mediaCount}/{limit.maxImages} 个素材
        </span>
      </div>
    </section>
  );
}
