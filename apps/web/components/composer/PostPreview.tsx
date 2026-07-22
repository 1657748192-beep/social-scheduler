"use client";

import type { ComposerPlatform, MediaAsset, SocialAccount } from "../../lib/api";
import { appendWebsiteToText } from "./contentUtils";
import { platformLimits } from "./platformConfig";

type PostPreviewProps = {
  accounts: SocialAccount[];
  texts: Record<ComposerPlatform, string>;
  websites: Record<ComposerPlatform, string>;
  baseText: string;
  baseWebsite: string;
  mediaByPlatform: Record<ComposerPlatform, MediaAsset[]>;
  loading: boolean;
};

export function PostPreview({
  accounts,
  texts,
  websites,
  baseText,
  baseWebsite,
  mediaByPlatform,
  loading
}: PostPreviewProps) {
  const groups = new Map<ComposerPlatform, SocialAccount[]>();
  const totalMediaCount = Object.values(mediaByPlatform).reduce(
    (count, media) => count + media.length,
    0
  );

  for (const account of accounts) {
    groups.set(account.platform, [...(groups.get(account.platform) ?? []), account]);
  }

  return (
    <section className="composer-panel publish-summary-panel">
      <div className="row">
        <div>
          <p className="section-kicker">发布摘要</p>
          <h2>将创建 {accounts.length} 个任务</h2>
        </div>
        <span className="muted">{totalMediaCount} 个平台素材</span>
      </div>

      <p className="muted">素材会按各个平台分别发布，不会互相混用。</p>

      {loading ? <p className="muted">正在读取目标账号…</p> : null}
      {!loading && !accounts.length ? <p className="muted">请先在左侧选择至少一个已连接账号。</p> : null}

      <div className="publish-summary-list">
        {[...groups.entries()].map(([platform, platformAccounts]) => {
          const limit = platformLimits[platform];
          const text = appendWebsiteToText(
            texts[platform] || baseText,
            websites[platform] || baseWebsite
          );
          const platformMedia = mediaByPlatform[platform];

          return (
            <article className="publish-summary-group" key={platform}>
              <div className="publish-summary-heading">
                <strong>{limit.label}</strong>
                <span>{platformAccounts.length} 个账号 · {platformMedia.length} 个素材</span>
              </div>
              <p>{text || "将使用基础文案"}</p>
              <p className="muted">这些素材会发到该平台的全部已选账号。</p>
              <div className="account-chip-list">
                {platformAccounts.slice(0, 4).map((account) => (
                  <span className="account-chip" key={account.id}>{account.displayName}</span>
                ))}
                {platformAccounts.length > 4 ? <span className="account-chip">+{platformAccounts.length - 4}</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
