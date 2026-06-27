"use client";

import type { ComposerPlatform } from "../../lib/api";
import { platformLimits } from "./platformConfig";

type PlatformEditorProps = {
  platform: ComposerPlatform;
  text: string;
  imageCount: number;
  onChange: (value: string) => void;
};

export function PlatformEditor({ platform, text, imageCount, onChange }: PlatformEditorProps) {
  const limit = platformLimits[platform];
  const overTextLimit = text.length > limit.maxTextLength;
  const overImageLimit = imageCount > limit.maxImages;

  return (
    <section className="composer-panel editor-surface">
      <div className="row">
        <h2>{limit.label}</h2>
        <span className={overTextLimit ? "counter danger" : "counter"}>
          {text.length}/{limit.maxTextLength}
        </span>
      </div>

      <textarea
        className="composer-textarea"
        onChange={(event) => onChange(event.target.value)}
        placeholder={`撰写 ${limit.label} 版本`}
        value={text}
      />

      <div className="validation-strip">
        <span className={overTextLimit ? "danger" : ""}>
          {overTextLimit ? "文案超过平台限制" : "文案长度正常"}
        </span>
        <span className={overImageLimit ? "danger" : ""}>
          {imageCount}/{limit.maxImages} 张图片
        </span>
      </div>
    </section>
  );
}
