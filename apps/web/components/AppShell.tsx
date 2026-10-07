"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiRequest, type CurrentUser } from "../lib/api";
import { LanguageToggle, useLanguage } from "./LanguageProvider";
import { AccountMenu } from "./AccountMenu";

type AppShellProps = {
  title: string;
  subtitle?: string;
  userLabel?: string;
  wide?: boolean;
  children: ReactNode;
};

const navItems = [
  { href: "/dashboard", label: ["控制台", "Dashboard"], helper: ["工作区与渠道", "Workspaces and channels"] },
  { href: "/composer", label: ["内容编辑", "Content editor"], helper: ["文案与素材", "Copy and media"] },
  { href: "/drafts", label: ["草稿箱", "Drafts"], helper: ["72 小时自动清理", "Auto-cleared after 72 hours"] },
  { href: "/calendar", label: ["排程日历", "Content calendar"], helper: ["周/月计划", "Weekly and monthly planning"] },
  { href: "/posts", label: ["帖子管理", "Post manager"], helper: ["已发布与复用", "Published posts and reuse"] },
  { href: "/inbox", label: ["Instagram 收件箱", "Instagram inbox"], helper: ["查看消息并手动回复", "Review messages and reply manually"] }
] as const;

export function AppShell({ title, subtitle, userLabel, wide = false, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [currentUserName, setCurrentUserName] = useState("");
  const accountName = userLabel?.trim() || currentUserName || t("账号", "Account");

  useEffect(() => {
    if (userLabel?.trim()) return;
    const token = localStorage.getItem("social_scheduler_token");
    if (!token) return;
    let mounted = true;
    apiRequest<CurrentUser>("/auth/me", { token }).then(user => {
      if (mounted) setCurrentUserName(user.name?.trim() || "");
    }).catch(() => null);
    return () => { mounted = false; };
  }, [userLabel]);

  async function signOut() {
    const token = localStorage.getItem("social_scheduler_token");

    if (token) {
      await apiRequest("/auth/logout", {
        method: "POST",
        token
      }).catch(() => null);
    }

    localStorage.removeItem("social_scheduler_token");
    router.replace("/login");
  }

  return (
    <main className="software-shell">
      <aside className="software-sidebar">
        <div className="software-brand">
          <div className="software-mark">S</div>
          <div>
            <strong>Social Scheduler</strong>
            <span>内容排程后台</span>
          </div>
        </div>

        <Link className="compose-entry" href="/composer">
          <span>+</span>
          {t("新建内容", "New content")}
        </Link>

        <nav className="software-nav" aria-label="主导航">
          {navItems.map((item) => (
            <Link
              className={pathname === item.href ? "active" : ""}
              href={item.href}
              key={item.href}
            >
              <strong>{t(item.label[0], item.label[1])}</strong>
              <small>{t(item.helper[0], item.helper[1])}</small>
            </Link>
          ))}
        </nav>

      </aside>

      <section className="software-main">
        <header className="software-topbar">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <div className="topbar-actions">
            <LanguageToggle compact />
            <Link className="button" href="/composer">
              {t("新建内容", "New content")}
            </Link>
            <AccountMenu name={accountName} signOutLabel={t("退出账号", "Sign out")} onSignOut={signOut} />
          </div>
        </header>

        <div className={wide ? "software-content wide" : "software-content"}>{children}</div>
      </section>

    </main>
  );
}
