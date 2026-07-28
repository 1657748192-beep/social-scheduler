"use client";

import { useState } from "react";
import type { ComposerPlatform, MediaAsset, SocialAccount } from "../../lib/api";
import { appendWebsiteToText } from "./contentUtils";
import { platformLimits } from "./platformConfig";

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
          <p className="section-kicker">发布摘要</p>
          <h2>将创建 {accounts.length} 个任务</h2>
        </div>
        <span className="muted">{totalMediaCount} 个平台素材</span>
      </div>

      <p className="muted">共用素材会复用到每个平台；单独调整的平台使用自己的专属素材。</p>

      {loading ? <p className="muted">正在读取目标账号…</p> : null}
      {!loading && !accounts.length ? <p className="muted">请先在左侧选择至少一个已连接账号。</p> : null}

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
                  {platformAccounts.length} 个账号 · {platformMedia.length} 个素材 · {mediaSource === "shared" ? "共用" : "专属"}
                </span>
              </div>
              <p>{text || "将使用基础文案"}</p>
              <p className="muted">
                {mediaSource === "shared"
                  ? "使用共用素材，会随基础素材的增删自动同步。"
                  : "使用专属素材，只会发到该平台的全部已选账号。"}
              </p>
              <div className="publish-summary-footer">
                <div className="account-chip-list">
                  {platformAccounts.slice(0, 4).map((account) => (
                    <span className="account-chip" key={account.id}>{account.displayName}</span>
                  ))}
                  {platformAccounts.length > 4 ? <span className="account-chip">+{platformAccounts.length - 4}</span> : null}
                </div>
                <button className="button secondary publish-preview-button" onClick={() => setPreviewPlatform(platform)} type="button">
                  预览效果
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
          aria-label={`${platformLimits[previewPlatform].label} 发布预览`}
          aria-modal="true"
          className="publish-preview-dialog"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <header className="publish-preview-header">
            <div>
              <p className="section-kicker">发布前预览</p>
              <h2>{platformLimits[previewPlatform].label} 效果</h2>
              <span>{previewAccounts.length} 个账号会使用这份内容</span>
            </div>
            <button aria-label="关闭预览" onClick={() => setPreviewPlatform(null)} type="button">
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
                  <strong>{previewAccount?.displayName || "发布账号"}</strong>
                  <small>{platformLimits[previewPlatform].label} · 发布后效果模拟</small>
                </div>
              </div>
              <p className="social-preview-text">{previewText || "这里会显示你填写的帖子文案。"}</p>
              {previewImageUrl ? (
                <img alt="发布素材预览" className="social-preview-media" src={previewImageUrl} />
              ) : previewAsset?.mimeType.startsWith("video/") ? (
                <div className="social-preview-media-placeholder">视频素材将显示首帧封面</div>
              ) : null}
              <div className="social-preview-engagement">
                <span>♡</span>
                <span>◌</span>
                <span>↗</span>
                <small>这是发布前模拟预览，实际平台样式可能略有不同。</small>
              </div>
            </article>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
