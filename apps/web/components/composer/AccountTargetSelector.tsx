"use client";

import { useState } from "react";
import type { ComposerPlatform, SocialAccount } from "../../lib/api";
import { composerPlatforms } from "./platformConfig";

type AccountTargetSelectorProps = {
  accounts: SocialAccount[];
  selectedAccountIds: string[];
  loading: boolean;
  onToggleAccount: (accountId: string) => void;
  onToggleAll: () => void;
};

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || "?";
}

export function AccountTargetSelector({
  accounts,
  selectedAccountIds,
  loading,
  onToggleAccount,
  onToggleAll
}: AccountTargetSelectorProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Partial<Record<ComposerPlatform, boolean>>>({});
  const selectedIds = new Set(selectedAccountIds);
  const allSelected = accounts.length > 0 && selectedAccountIds.length === accounts.length;
  const groupedAccounts = composerPlatforms
    .map((platform) => ({
      platform,
      accounts: accounts.filter((account) => account.platform === platform.platform)
    }))
    .filter((group) => group.accounts.length > 0);

  return (
    <section className="composer-panel account-target-panel" aria-label="选择发布账号">
      <div className="target-panel-heading">
        <div className="step-heading">
          <span className="step-badge">1</span>
          <div>
            <p className="section-kicker">发布范围</p>
            <h1>选择发布账号</h1>
            <p className="muted">
              {loading
                ? "正在读取已连接账号…"
                : `已选择 ${selectedAccountIds.length} 个账号，将各自创建独立发布任务。`}
            </p>
          </div>
        </div>
        <button className="text-button" disabled={!accounts.length || loading} onClick={onToggleAll} type="button">
          {allSelected ? "取消全选" : "选择全部"}
        </button>
      </div>

      {!loading && !accounts.length ? (
        <div className="account-target-empty">
          <strong>还没有可发布的已连接账号</strong>
          <span>先连接 Facebook 页面或 YouTube 频道，再回来创建内容。</span>
          <a href="/dashboard">去连接渠道</a>
        </div>
      ) : null}

      <div className="account-target-groups" aria-busy={loading}>
        {groupedAccounts.map(({ platform, accounts: platformAccounts }) => {
          const selectedPlatformAccountCount = platformAccounts.filter((account) => selectedIds.has(account.id)).length;
          const expanded = expandedPlatforms[platform.platform] ?? platformAccounts.length <= 3;

          return (
            <section className="account-target-group" key={platform.platform}>
              <button
                aria-controls={`account-target-list-${platform.platform}`}
                aria-expanded={expanded}
                className="account-group-heading"
                onClick={() =>
                  setExpandedPlatforms((current) => ({
                    ...current,
                    [platform.platform]: !expanded
                  }))
                }
                type="button"
              >
                <span className="account-group-label">
                  <strong>{platform.label}</strong>
                  <small>
                    {platformAccounts.length} 个已连接账号{selectedPlatformAccountCount ? ` · 已选择 ${selectedPlatformAccountCount} 个账号` : ""}
                  </small>
                </span>
                <span className="account-group-toggle-action">
                  {expanded ? "收起账号" : "展开账号"}
                  <span aria-hidden="true" className={`account-group-chevron ${expanded ? "expanded" : ""}`}>
                    ▾
                  </span>
                </span>
              </button>
              {expanded ? (
                <div
                  aria-label={platformAccounts.length > 5 ? `${platform.label} 账号列表，可滚动查看其余账号` : undefined}
                  className={`account-target-list ${platformAccounts.length > 5 ? "scrollable" : ""}`}
                  id={`account-target-list-${platform.platform}`}
                >
                  {platformAccounts.map((account) => {
                    const checked = selectedIds.has(account.id);

                    return (
                      <label className={`account-target-row ${checked ? "selected" : ""}`} key={account.id}>
                        <input
                          aria-label={`选择 ${account.displayName}`}
                          checked={checked}
                          onChange={() => onToggleAccount(account.id)}
                          type="checkbox"
                        />
                        <span className={`account-target-avatar ${platform.platform}`}>
                          {account.avatarUrl ? <img alt="" src={account.avatarUrl} /> : initials(account.displayName)}
                        </span>
                        <span className="account-target-meta">
                          <strong>{account.displayName}</strong>
                          <small>{account.accountType === "page" ? "Facebook 主页" : account.accountType === "channel" ? "YouTube 频道" : platform.label}</small>
                        </span>
                        <span className="account-target-status">已连接</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
