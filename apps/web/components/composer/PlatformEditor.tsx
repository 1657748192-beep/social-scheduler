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
        placeholder={`Write a ${limit.label} version`}
        value={text}
      />

      <div className="validation-strip">
        <span className={overTextLimit ? "danger" : ""}>
          {overTextLimit ? "Text is over the platform limit" : "Text length is ready"}
        </span>
        <span className={overImageLimit ? "danger" : ""}>
          {imageCount}/{limit.maxImages} images
        </span>
      </div>
    </section>
  );
}
