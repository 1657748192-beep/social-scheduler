"use client";

import type { ComposerPlatform, MediaAsset, SocialAccount } from "../../lib/api";
import { platformLimits } from "./platformConfig";

type PostPreviewProps = {
  accounts: SocialAccount[];
  texts: Record<ComposerPlatform, string>;
  baseText: string;
  media: MediaAsset[];
  loading: boolean;
};

export function PostPreview({ accounts, texts, baseText, media, loading }: PostPreviewProps) {
  const groups = new Map<ComposerPlatform, SocialAccount[]>();

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
        <span className="muted">{media.length} 个素材</span>
      </div>

      {loading ? <p className="muted">正在读取目标账号…</p> : null}
      {!loading && !accounts.length ? <p className="muted">请先在左侧选择至少一个已连接账号。</p> : null}

      <div className="publish-summary-list">
        {[...groups.entries()].map(([platform, platformAccounts]) => {
          const limit = platformLimits[platform];
          const text = texts[platform] || baseText;

          return (
            <article className="publish-summary-group" key={platform}>
              <div className="publish-summary-heading">
                <strong>{limit.label}</strong>
                <span>{platformAccounts.length} 个账号</span>
              </div>
              <p>{text || "将使用基础文案"}</p>
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
