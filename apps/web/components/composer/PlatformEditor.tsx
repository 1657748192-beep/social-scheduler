"use client";

import { useRef } from "react";
import type { ComposerPlatform } from "../../lib/api";
import { appendWebsiteToText } from "./contentUtils";
import { platformLimits } from "./platformConfig";
import { TextInsertToolbar } from "./TextInsertToolbar";

export type WebsiteMode = "inherit" | "custom" | "none";

type PlatformEditorProps = {
  platform: ComposerPlatform;
  text: string;
  website: string;
  baseWebsite: string;
  websiteMode: WebsiteMode;
  mediaCount: number;
  onChange: (value: string) => void;
  onWebsiteChange: (value: string) => void;
  onWebsiteModeChange: (value: WebsiteMode) => void;
};

export function PlatformEditor({
  platform,
  text,
  website,
  baseWebsite,
  websiteMode,
  mediaCount,
  onChange,
  onWebsiteChange,
  onWebsiteModeChange
}: PlatformEditorProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const limit = platformLimits[platform];
  const resolvedWebsite = websiteMode === "inherit" ? baseWebsite : websiteMode === "custom" ? website : "";
  const contentWithWebsite = appendWebsiteToText(text, resolvedWebsite);
  const overTextLimit = contentWithWebsite.length > limit.maxTextLength;
  const overMediaLimit = mediaCount > limit.maxImages;

  function insertText(value: string) {
    const textArea = textAreaRef.current;
    const start = textArea?.selectionStart ?? text.length;
    const end = textArea?.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${value}${text.slice(end)}`;

    onChange(nextText);
    requestAnimationFrame(() => {
      textArea?.focus();
      textArea?.setSelectionRange(start + value.length, start + value.length);
    });
  }

  return (
    <section className="composer-panel editor-surface">
      <div className="row">
        <div>
          <p className="section-kicker">平台版本</p>
          <h2>{limit.label}</h2>
        </div>
        <span className={overTextLimit ? "counter danger" : "counter"}>
          {contentWithWebsite.length}/{limit.maxTextLength}
        </span>
      </div>

      <textarea
        className="composer-textarea"
        onChange={(event) => onChange(event.target.value)}
        placeholder={`撰写 ${limit.label} 专属版本`}
        ref={textAreaRef}
        value={text}
      />
      <TextInsertToolbar onInsert={insertText} />

      <label className="field website-field">
        <span>{limit.label} 网站链接（可选）</span>
        <div className="website-mode-switch" role="group" aria-label={`${limit.label} 网站链接方式`}>
          <button
            className={websiteMode === "inherit" ? "active" : ""}
            onClick={() => onWebsiteModeChange("inherit")}
            type="button"
          >
            使用基础链接
          </button>
          <button
            className={websiteMode === "custom" ? "active" : ""}
            onClick={() => onWebsiteModeChange("custom")}
            type="button"
          >
            单独编辑
          </button>
          <button
            className={websiteMode === "none" ? "active" : ""}
            onClick={() => onWebsiteModeChange("none")}
            type="button"
          >
            不添加链接
          </button>
        </div>
        {websiteMode === "none" ? (
          <small>此平台本次发布不会附加网站链接。</small>
        ) : (
          <input
            disabled={websiteMode === "inherit"}
            inputMode="url"
            onChange={(event) => onWebsiteChange(event.target.value)}
            placeholder={websiteMode === "inherit" ? "请先在基础内容填写网站链接" : "https://example.com"}
            type="url"
            value={resolvedWebsite}
          />
        )}
        <small>
          {websiteMode === "inherit"
            ? "跟随基础网站链接；选择“单独编辑”后可为此平台填写不同链接。"
            : "链接会附在该平台文案末尾，并计入字数限制。"}
        </small>
      </label>

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
