"use client";

import { useRef } from "react";
import type { ComposerPlatform } from "../../lib/api";
import { appendWebsiteToText } from "./contentUtils";
import { platformLimits } from "./platformConfig";
import { TextInsertToolbar } from "./TextInsertToolbar";
import { useLanguage } from "../LanguageProvider";

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
  const { t } = useLanguage();
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
          <p className="section-kicker">{t("平台版本", "Platform version")}</p>
          <h2>{limit.label}</h2>
        </div>
        <span className={overTextLimit ? "counter danger" : "counter"}>
          {contentWithWebsite.length}/{limit.maxTextLength}
        </span>
      </div>

      <textarea
        className="composer-textarea"
        onChange={(event) => onChange(event.target.value)}
        placeholder={t(`撰写 ${limit.label} 专属版本`, `Write a version for ${limit.label}`)}
        ref={textAreaRef}
        value={text}
      />
      <TextInsertToolbar onInsert={insertText} />

      <label className="field website-field">
        <span>{t(`${limit.label} 网站链接（可选）`, `${limit.label} website link (optional)`)}</span>
        <div className="website-mode-switch" role="group" aria-label={t(`${limit.label} 网站链接方式`, `${limit.label} website link method`)}>
          <button
            className={websiteMode === "inherit" ? "active" : ""}
            onClick={() => onWebsiteModeChange("inherit")}
            type="button"
          >
            {t("使用基础链接", "Use base link")}
          </button>
          <button
            className={websiteMode === "custom" ? "active" : ""}
            onClick={() => onWebsiteModeChange("custom")}
            type="button"
          >
            {t("单独编辑", "Custom link")}
          </button>
          <button
            className={websiteMode === "none" ? "active" : ""}
            onClick={() => onWebsiteModeChange("none")}
            type="button"
          >
            {t("不添加链接", "No link")}
          </button>
        </div>
        {websiteMode === "none" ? (
          <small>{t("此平台本次发布不会附加网站链接。", "This platform will not include a website link.")}</small>
        ) : (
          <input
            disabled={websiteMode === "inherit"}
            inputMode="url"
            onChange={(event) => onWebsiteChange(event.target.value)}
            placeholder={websiteMode === "inherit" ? t("请先在基础内容填写网站链接", "Add a website link in base content first") : "https://example.com"}
            type="url"
            value={resolvedWebsite}
          />
        )}
        <small>
          {websiteMode === "inherit"
            ? t("跟随基础网站链接；选择“单独编辑”后可为此平台填写不同链接。", "Follows the base website link. Choose Custom link to use a different URL for this platform.")
            : t("链接会附在该平台文案末尾，并计入字数限制。", "The link is added to the end of this platform's copy and counts toward its character limit.")}
        </small>
      </label>

      <div className="validation-strip">
        <span className={overTextLimit ? "danger" : ""}>
          {overTextLimit ? t("文案超过平台限制", "Copy exceeds platform limit") : t("文案长度正常", "Copy length is valid")}
        </span>
        <span className={overMediaLimit ? "danger" : ""}>
          {t(`${mediaCount}/${limit.maxImages} 个素材`, `${mediaCount}/${limit.maxImages} media items`)}
        </span>
      </div>
    </section>
  );
}
