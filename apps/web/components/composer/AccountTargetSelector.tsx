"use client";

import { useState } from "react";
import type { ComposerPlatform, SocialAccount } from "../../lib/api";
import { composerPlatforms } from "./platformConfig";
import { useLanguage } from "../LanguageProvider";

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
  const { t } = useLanguage();
  const [expandedPlatforms, setExpandedPlatforms] = useState<Partial<Record<ComposerPlatform, boolean>>>({});
  const [failedAvatarIds, setFailedAvatarIds] = useState<Record<string, true>>({});
  const selectedIds = new Set(selectedAccountIds);
  const allSelected = accounts.length > 0 && selectedAccountIds.length === accounts.length;
  const groupedAccounts = composerPlatforms
    .map((platform) => ({
      platform,
      accounts: accounts.filter((account) => account.platform === platform.platform)
    }))
    .filter((group) => group.accounts.length > 0);

  return (
    <section className="composer-panel account-target-panel" aria-label={t("选择发布账号", "Select publishing accounts")}>
      <div className="target-panel-heading">
        <div className="step-heading">
          <span className="step-badge">1</span>
          <div>
            <p className="section-kicker">{t("发布范围", "Publishing targets")}</p>
            <h1>{t("选择发布账号", "Select publishing accounts")}</h1>
            <p className="muted">
              {loading
                ? t("正在读取已连接账号…", "Loading connected accounts...")
                : t(`已选择 ${selectedAccountIds.length} 个账号，将各自创建独立发布任务。`, `${selectedAccountIds.length} accounts selected. A separate publishing task will be created for each one.`)}
            </p>
          </div>
        </div>
        <button className="text-button" disabled={!accounts.length || loading} onClick={onToggleAll} type="button">
          {allSelected ? t("取消全选", "Clear selection") : t("选择全部", "Select all")}
        </button>
      </div>

      {!loading && !accounts.length ? (
        <div className="account-target-empty">
          <strong>{t("还没有可发布的已连接账号", "No connected accounts are ready to publish")}</strong>
          <span>{t("先连接 Facebook 页面或 YouTube 频道，再回来创建内容。", "Connect a Facebook Page or YouTube channel, then come back to create content.")}</span>
          <a href="/dashboard">{t("去连接渠道", "Connect channels")}</a>
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
                  {expanded ? t("收起账号", "Collapse accounts") : t("展开账号", "Expand accounts")}
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
                          {account.avatarUrl && !failedAvatarIds[account.id] ? (
                            <img
                              alt=""
                              onError={() =>
                                setFailedAvatarIds((current) =>
                                  current[account.id] ? current : { ...current, [account.id]: true }
                                )
                              }
                              referrerPolicy="no-referrer"
                              src={account.avatarUrl}
                            />
                          ) : (
                            initials(account.displayName)
                          )}
                        </span>
                        <span className="account-target-meta">
                          <strong>{account.displayName}</strong>
                          <small>{account.accountType === "page" ? t("Facebook 主页", "Facebook Page") : account.accountType === "channel" ? t("YouTube 频道", "YouTube channel") : platform.label}</small>
                        </span>
                        <span className="account-target-status">{t("已连接", "Connected")}</span>
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
