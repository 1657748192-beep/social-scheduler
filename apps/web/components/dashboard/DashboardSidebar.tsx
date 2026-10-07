import React from "react";
import type { SocialAccount } from "../../lib/api";
import { accountStatusLabel, platformLabel } from "../../lib/labels";
import { PlatformLogo } from "../PlatformLogo";

type Props = { accounts: SocialAccount[]; locale: "zh-CN" | "en"; loading: boolean; failed?: boolean };

export function DashboardSidebar({ accounts, locale, loading, failed = false }: Props) {
  const t = (zh: string, en: string) => locale === "en" ? en : zh;
  const shortcuts = [
    { href: "/composer", symbol: "✎", label: t("新建内容", "New content") },
    { href: "/calendar", symbol: "▦", label: t("查看日历", "View calendar") },
    { href: "/drafts", symbol: "▤", label: t("草稿箱", "Drafts") },
    { href: "/posts", symbol: "▥", label: t("帖子管理", "Post manager") }
  ];
  return (
    <aside className="dashboard-overview-sidebar" aria-label={t("账号与快捷操作", "Accounts and shortcuts")}>
      <section className="panel dashboard-account-overview">
        <div className="row">
          <h2>{t("社交账号", "Social accounts")}</h2>
          <a className="text-button" href="#social-channels">{t("管理", "Manage")}</a>
        </div>
        {failed ? <p className="muted" role="status">{t("账号读取失败，请刷新重试。", "Could not load accounts. Refresh to retry.")}</p> : loading ? <p className="muted" role="status">{t("正在读取账号…", "Loading accounts…")}</p> : (
          <ul className="dashboard-account-list">
            {accounts.map(account => (
              <li key={account.id}>
                <PlatformLogo platform={account.platform} className="channel-icon" />
                <span className="dashboard-account-identity"><strong>{account.displayName}</strong><small>{platformLabel(account.platform)}</small></span>
                <span className="dashboard-account-state" data-connected={account.status === "active"}>
                  {accountStatusLabel(account.status, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!failed && !loading && !accounts.length ? <p className="muted">{t("暂未绑定社交账号", "No social accounts connected")}</p> : null}
        <a className="button secondary dashboard-account-manage" href="#social-channels">{t("连接渠道", "Connect channels")}</a>
      </section>
      <section className="panel dashboard-shortcuts">
        <h2>{t("快捷操作", "Quick actions")}</h2>
        <nav className="dashboard-shortcut-grid" aria-label={t("快捷操作", "Quick actions")}>
          {shortcuts.map((item, index) => <a href={item.href} key={item.href}><span className={`shortcut-symbol tone-${index}`} aria-hidden="true">{item.symbol}</span><strong>{item.label}</strong></a>)}
        </nav>
      </section>
    </aside>
  );
}
