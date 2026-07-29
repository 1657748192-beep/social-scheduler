"use client";

import { useState } from "react";
import type { ComposerPlatform, MediaAsset, SocialAccount } from "../../lib/api";
import { appendWebsiteToText } from "./contentUtils";
import { platformLimits } from "./platformConfig";
import { useLanguage } from "../LanguageProvider";

type PostPreviewProps = {
  accounts: SocialAccount[];
  texts: Record<ComposerPlatform, string>;
  websites: Record<ComposerPlatform, string>;
  baseText: string;
  mediaByPlatform: Record<ComposerPlatform, MediaAsset[]>;
  mediaSources: Record<ComposerPlatform, "shared" | "custom">;
  loading: boolean;
};

export function PostPreview({
  accounts,
  texts,
  websites,
  baseText,
  mediaByPlatform,
  mediaSources,
  loading
}: PostPreviewProps) {
  const { t } = useLanguage();
  const [previewPlatform, setPreviewPlatform] = useState<ComposerPlatform | null>(null);
  const groups = new Map<ComposerPlatform, SocialAccount[]>();
  const selectedPlatforms = Array.from(new Set(accounts.map((account) => account.platform)));
  const totalMediaCount = selectedPlatforms.reduce(
    (count, platform) => count + mediaByPlatform[platform].length,
    0
  );

  for (const account of accounts) {
    groups.set(account.platform, [...(groups.get(account.platform) ?? []), account]);
  }

  const previewAccounts = previewPlatform ? groups.get(previewPlatform) ?? [] : [];
  const previewText = previewPlatform
    ? appendWebsiteToText(texts[previewPlatform] || baseText, websites[previewPlatform])
    : "";
  const previewMedia = previewPlatform ? mediaByPlatform[previewPlatform] : [];
  const previewAsset = previewMedia[0];
  const previewImageUrl = previewAsset?.thumbnailUrl ?? (
    previewAsset?.mimeType.startsWith("image/") && previewAsset.originalAvailable !== false
      ? previewAsset.fileUrl
      : null
  );
  const previewAccount = previewAccounts[0];

  return (
    <>
    <section className="composer-panel publish-summary-panel">
      <div className="row">
        <div>
          <p className="section-kicker">{t("发布摘要", "Publishing summary")}</p>
          <h2>{t(`将创建 ${accounts.length} 个任务`, `${accounts.length} tasks will be created`)}</h2>
        </div>
        <span className="muted">{t(`${totalMediaCount} 个平台素材`, `${totalMediaCount} platform media items`)}</span>
      </div>

      <p className="muted">{t("共用素材会复用到每个平台；单独调整的平台使用自己的专属素材。", "Shared media is reused on every platform. Customized platforms use their own media.")}</p>

      {loading ? <p className="muted">{t("正在读取目标账号…", "Loading target accounts...")}</p> : null}
      {!loading && !accounts.length ? <p className="muted">{t("请先在左侧选择至少一个已连接账号。", "Select at least one connected account on the left.")}</p> : null}

      <div className="publish-summary-list">
        {[...groups.entries()].map(([platform, platformAccounts]) => {
          const limit = platformLimits[platform];
          const text = appendWebsiteToText(
            texts[platform] || baseText,
            websites[platform]
          );
          const platformMedia = mediaByPlatform[platform];
          const mediaSource = mediaSources[platform];

          return (
            <article className="publish-summary-group" key={platform}>
              <div className="publish-summary-heading">
                <strong>{limit.label}</strong>
                <span>
                  {t(`${platformAccounts.length} 个账号 · ${platformMedia.length} 个素材 · ${mediaSource === "shared" ? "共用" : "专属"}`, `${platformAccounts.length} accounts · ${platformMedia.length} media items · ${mediaSource === "shared" ? "shared" : "custom"}`)}
                </span>
              </div>
              <p>{text || t("将使用基础文案", "Base copy will be used")}</p>
              <p className="muted">
                {mediaSource === "shared"
                  ? t("使用共用素材，会随基础素材的增删自动同步。", "Using shared media; it automatically follows changes to base media.")
                  : t("使用专属素材，只会发到该平台的全部已选账号。", "Using custom media; it will publish only to selected accounts on this platform.")}
              </p>
              <div className="publish-summary-footer">
                <div className="account-chip-list">
                  {platformAccounts.slice(0, 4).map((account) => (
                    <span className="account-chip" key={account.id}>{account.displayName}</span>
                  ))}
                  {platformAccounts.length > 4 ? <span className="account-chip">+{platformAccounts.length - 4}</span> : null}
                </div>
                <button className="button secondary publish-preview-button" onClick={() => setPreviewPlatform(platform)} type="button">
                  {t("预览效果", "Preview")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>

    {previewPlatform ? (
      <div
        className="publish-preview-backdrop"
        onClick={() => setPreviewPlatform(null)}
        role="presentation"
      >
        <section
          aria-label={t(`${platformLimits[previewPlatform].label} 发布预览`, `${platformLimits[previewPlatform].label} publishing preview`)}
          aria-modal="true"
          className="publish-preview-dialog"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <header className="publish-preview-header">
            <div>
              <p className="section-kicker">{t("发布前预览", "Pre-publishing preview")}</p>
              <h2>{t(`${platformLimits[previewPlatform].label} 效果`, `${platformLimits[previewPlatform].label} preview`)}</h2>
              <span>{t(`${previewAccounts.length} 个账号会使用这份内容`, `${previewAccounts.length} accounts will use this content`)}</span>
            </div>
            <button aria-label={t("关闭预览", "Close preview")} onClick={() => setPreviewPlatform(null)} type="button">
              ×
            </button>
          </header>

          <div className="publish-preview-body">
            <article className={`social-post-preview ${previewPlatform}`}>
              <div className="social-preview-account">
                <span className="social-preview-avatar">
                  {(previewAccount?.displayName || platformLimits[previewPlatform].label).slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{previewAccount?.displayName || t("发布账号", "Publishing account")}</strong>
                  <small>{t(`${platformLimits[previewPlatform].label} · 发布后效果模拟`, `${platformLimits[previewPlatform].label} · simulated post`)}</small>
                </div>
              </div>
              <p className="social-preview-text">{previewText || t("这里会显示你填写的帖子文案。", "Your post copy will appear here.")}</p>
              {previewImageUrl ? (
                <img alt={t("发布素材预览", "Publishing media preview")} className="social-preview-media" src={previewImageUrl} />
              ) : previewAsset?.mimeType.startsWith("video/") ? (
                <div className="social-preview-media-placeholder">{t("视频素材将显示首帧封面", "Video media will show its cover frame")}</div>
              ) : null}
              <div className="social-preview-engagement">
                <span>♡</span>
                <span>◌</span>
                <span>↗</span>
                <small>{t("这是发布前模拟预览，实际平台样式可能略有不同。", "This is a simulated preview; actual platform styling may differ slightly.")}</small>
              </div>
            </article>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
