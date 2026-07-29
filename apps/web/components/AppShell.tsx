"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  apiRequest,
  type OAuthProviderStatus,
  type OAuthStartResponse,
  type SocialAccount,
  type Workspace
} from "../lib/api";
import { LanguageToggle, useLanguage, type AppLocale } from "./LanguageProvider";

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
  { href: "/posts", label: ["帖子管理", "Post manager"], helper: ["已发布与复用", "Published posts and reuse"] }
] as const;

type SidebarProvider = Pick<
  OAuthProviderStatus,
  "platform" | "platformParam" | "displayName" | "configured" | "requiredEnv"
>;

const defaultChannelProviders: SidebarProvider[] = [
  {
    platform: "instagram",
    platformParam: "instagram",
    displayName: "Instagram",
    configured: false,
    requiredEnv: ["INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"]
  },
  {
    platform: "linkedin",
    platformParam: "linkedin",
    displayName: "LinkedIn",
    configured: false,
    requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]
  },
  {
    platform: "facebook",
    platformParam: "facebook",
    displayName: "Facebook",
    configured: false,
    requiredEnv: ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"]
  },
  {
    platform: "youtube",
    platformParam: "youtube",
    displayName: "YouTube",
    configured: false,
    requiredEnv: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]
  },
  {
    platform: "tiktok",
    platformParam: "tiktok",
    displayName: "TikTok",
    configured: false,
    requiredEnv: ["TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"]
  },
  {
    platform: "pinterest",
    platformParam: "pinterest",
    displayName: "Pinterest",
    configured: false,
    requiredEnv: ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"]
  },
  {
    platform: "x",
    platformParam: "twitter",
    displayName: "Twitter / X",
    configured: false,
    requiredEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET"]
  }
];

const sidebarChannelOrder: SidebarProvider["platform"][] = ["instagram", "facebook", "x"];

function channelInitial(platform: SidebarProvider["platform"]) {
  const initials: Record<SidebarProvider["platform"], string> = {
    instagram: "IG",
    linkedin: "in",
    facebook: "f",
    youtube: "▶",
    tiktok: "♪",
    pinterest: "P",
    x: "X"
  };

  return initials[platform];
}

function channelDescription(platform: SidebarProvider["platform"], locale: AppLocale) {
  const descriptions: Record<SidebarProvider["platform"], [string, string]> = {
    instagram: ["图片、短视频与 Reels", "Images, short videos, and Reels"],
    linkedin: ["个人主页或公司主页", "Personal or company Page"],
    facebook: ["公共主页发布", "Publish to Facebook Pages"],
    youtube: ["频道视频发布", "Publish videos to a channel"],
    tiktok: ["短视频账号", "Short-video account"],
    pinterest: ["图钉与看板", "Pins and boards"],
    x: ["短文与动态", "Short posts and updates"]
  };

  return descriptions[platform][locale === "en" ? 1 : 0];
}

function platformLabelFallback(platform: SidebarProvider["platform"]) {
  return defaultChannelProviders.find((provider) => provider.platform === platform)?.displayName ?? platform;
}

function channelStatusText(
  account: SocialAccount | undefined,
  provider: SidebarProvider,
  t: (chinese: string, english: string) => string
) {
  if (account?.status === "active") {
    return account.displayName || t("已连接", "Connected");
  }

  if (account?.status === "token_expired") {
    return t("授权已过期", "Authorization expired");
  }

  if (account?.status === "disconnected") {
    return t("已断开", "Disconnected");
  }

  return provider.configured ? t("可一键授权", "Ready to connect") : t("待配置", "Needs setup");
}

function mergeProviderStatuses(statuses: OAuthProviderStatus[]) {
  if (!statuses.length) {
    return defaultChannelProviders;
  }

  const byPlatform = new Map<SidebarProvider["platform"], SidebarProvider>();
  defaultChannelProviders.forEach((provider) => byPlatform.set(provider.platform, provider));
  statuses.forEach((provider) => byPlatform.set(provider.platform, provider));

  return defaultChannelProviders
    .map((provider) => byPlatform.get(provider.platform))
    .filter(Boolean) as SidebarProvider[];
}

export function AppShell({ title, subtitle, userLabel, wide = false, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useLanguage();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [channels, setChannels] = useState<SocialAccount[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<OAuthProviderStatus[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [channelActionError, setChannelActionError] = useState<string | null>(null);
  const [disconnectingChannelId, setDisconnectingChannelId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const token = localStorage.getItem("social_scheduler_token");

    if (!token) {
      setChannelsLoading(false);
      return;
    }

    async function loadSidebarChannels() {
      setChannelsLoading(true);

      try {
        const [workspaceList, oauthStatusList] = await Promise.all([
          apiRequest<Workspace[]>("/workspaces", { token }),
          apiRequest<OAuthProviderStatus[]>("/integrations/oauth/status", { token })
        ]);

        if (!isMounted) {
          return;
        }

        const activeWorkspace = workspaceList[0];
        setWorkspaceId(activeWorkspace?.id ?? null);
        setProviderStatuses(oauthStatusList);

        if (!activeWorkspace?.id) {
          setChannels([]);
          return;
        }

        const socialAccountList = await apiRequest<SocialAccount[]>(
          `/workspaces/${activeWorkspace.id}/social-accounts`,
          { token }
        );

        if (isMounted) {
          setChannels(socialAccountList);
        }
      } catch {
        if (isMounted) {
          setChannels([]);
          setProviderStatuses([]);
        }
      } finally {
        if (isMounted) {
          setChannelsLoading(false);
        }
      }
    }

    loadSidebarChannels();

    return () => {
      isMounted = false;
    };
  }, []);

  const channelProviders = useMemo(
    () => mergeProviderStatuses(providerStatuses),
    [providerStatuses]
  );
  const sidebarProviders = channelProviders.filter((provider) =>
    sidebarChannelOrder.includes(provider.platform)
  );
  const connectedPlatformCount = new Set(
    channels
      .filter((account) => account.status === "active")
      .map((account) => account.platform)
  ).size;
  const totalChannelCount = channelProviders.length;
  const channelItems = useMemo(
    () =>
      channelProviders.map((provider) => ({
        provider,
        account: channels.find((account) => account.platform === provider.platform)
      })),
    [channelProviders, channels]
  );
  const sidebarChannelItems = useMemo(
    () =>
      sidebarProviders.map((provider) => ({
        provider,
        account: channels.find((account) => account.platform === provider.platform)
      })),
    [sidebarProviders, channels]
  );

  async function openChannel(provider: SidebarProvider, account?: SocialAccount) {
    setChannelActionError(null);

    const token = localStorage.getItem("social_scheduler_token");

    if (!token) {
      router.push("/login");
      return;
    }

    if (account?.status === "active") {
      router.push("/dashboard#social-channels");
      setIsChannelModalOpen(false);
      return;
    }

    if (!workspaceId) {
      setChannelActionError("请先创建或选择一个工作区。");
      return;
    }

    if (!provider.configured) {
      setChannelActionError(
        `${provider.displayName} 还没有配置开发者密钥：${provider.requiredEnv.join(" / ")}`
      );
      return;
    }

    try {
      const response = await apiRequest<OAuthStartResponse>(
        `/integrations/${provider.platformParam}/oauth/start?workspaceId=${workspaceId}`,
        { token }
      );
      window.location.href = response.authorizationUrl;
    } catch (error) {
      setChannelActionError(error instanceof Error ? error.message : "启动授权失败");
    }
  }

  async function disconnectChannel(account: SocialAccount) {
    setChannelActionError(null);

    const token = localStorage.getItem("social_scheduler_token");

    if (!token) {
      router.push("/login");
      return;
    }

    if (!workspaceId) {
      setChannelActionError("请先创建或选择一个工作区。");
      return;
    }

    const confirmed = window.confirm(
      `确定解除绑定 ${account.displayName || platformLabelFallback(account.platform)} 吗？`
    );

    if (!confirmed) {
      return;
    }

    setDisconnectingChannelId(account.id);

    try {
      await apiRequest(`/workspaces/${workspaceId}/social-accounts/${account.id}`, {
        method: "DELETE",
        token
      });

      setChannels((current) => current.filter((item) => item.id !== account.id));
    } catch (error) {
      setChannelActionError(error instanceof Error ? error.message : "解除绑定失败");
    } finally {
      setDisconnectingChannelId(null);
    }
  }

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

        <section className="software-channels" aria-label="连接通道">
          <div className="channels-heading">
            <span>{t("连接通道", "Connected channels")}</span>
            <button
              aria-label="打开更多通道"
              onClick={() => setIsChannelModalOpen(true)}
              type="button"
            >
              +
            </button>
          </div>

          <div className="channels-list">
            {sidebarChannelItems.map(({ provider, account }) => {
              const connected = account?.status === "active";
              const rowClassName = connected
                ? "channel-row connected"
                : provider.configured
                  ? "channel-row ready"
                  : "channel-row";

              return (
                <div className={rowClassName} key={provider.platform}>
                  <button
                    className="channel-row-main"
                    onClick={() => openChannel(provider, account)}
                    type="button"
                  >
                    <span className={`channel-icon ${provider.platform}`}>
                      {channelInitial(provider.platform)}
                    </span>
                    <span className="channel-copy">
                      <strong>{provider.displayName}</strong>
                      <small>{channelStatusText(account, provider, t)}</small>
                    </span>
                  </button>

                  {connected && account ? (
                    <button
                      aria-label={`解除绑定 ${provider.displayName}`}
                      className="channel-row-action"
                      disabled={disconnectingChannelId === account.id}
                      onClick={() => disconnectChannel(account)}
                      type="button"
                    >
                      {t("解绑", "Disconnect")}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {channelsLoading ? <span className="channels-empty">{t("正在读取通道", "Loading channels")}</span> : null}

            <button
              className="channel-more"
              onClick={() => setIsChannelModalOpen(true)}
              type="button"
            >
              <span className="channel-icon more">+</span>
              <span>{t("更多通道", "More channels")}</span>
            </button>
          </div>
        </section>

        <div className="channel-progress">
          <div className="row">
            <strong>{t("已连接平台数量", "Connected platforms")}</strong>
            <span>
              {connectedPlatformCount}/{totalChannelCount}
            </span>
          </div>
          <div className="progress-track">
            <span
              style={{
                width: `${Math.min(
                  (connectedPlatformCount / Math.max(totalChannelCount, 1)) * 100,
                  100
                )}%`
              }}
            />
          </div>
          <small className="channel-progress-note">{t("同一平台的账号数量不限", "No limit on accounts per platform")}</small>
        </div>

        <div className="software-sidebar-footer">
          <span>{userLabel || t("已登录", "Signed in")}</span>
          <button className="button secondary" onClick={signOut} type="button">
            {t("退出登录", "Sign out")}
          </button>
        </div>
      </aside>

      <section className="software-main">
        <header className="software-topbar">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <div className="topbar-actions">
            <LanguageToggle compact />
            <Link className="button secondary" href="/dashboard#social-channels">
              {t("连接渠道", "Connect channels")}
            </Link>
            <Link className="button secondary" href="/calendar">
              {t("查看日历", "View calendar")}
            </Link>
            <Link className="button" href="/composer">
              {t("新建内容", "New content")}
            </Link>
          </div>
        </header>

        <div className={wide ? "software-content wide" : "software-content"}>{children}</div>
      </section>

      {isChannelModalOpen ? (
        <div
          className="channel-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsChannelModalOpen(false);
            }
          }}
        >
          <section className="channel-modal" aria-modal="true" role="dialog">
            <header className="channel-modal-header">
              <div>
                <h2>{t("连接新频道", "Connect a new channel")}</h2>
                <p>{t("选择平台后会跳转到对应平台登录授权页面。", "Choose a platform to continue to its official authorization page.")}</p>
              </div>
              <button
                aria-label="关闭连接频道弹窗"
                onClick={() => setIsChannelModalOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>

            {channelActionError ? <p className="channel-modal-error">{channelActionError}</p> : null}

            <div className="channel-modal-grid">
              {channelItems.map(({ provider, account }) => {
                const connected = account?.status === "active";
                const actionText = connected
                  ? t("已连接，点击查看", "Connected — click to view")
                  : provider.configured
                    ? t("点击授权", "Click to authorize")
                    : t("待配置密钥", "Developer keys needed");

                return (
                  <article
                    className={connected ? "channel-card connected" : "channel-card"}
                    key={provider.platform}
                  >
                    <button
                      className="channel-card-main"
                      onClick={() => openChannel(provider, connected ? undefined : account)}
                      type="button"
                    >
                      <span className={`channel-card-icon ${provider.platform}`}>
                        {channelInitial(provider.platform)}
                      </span>
                      <strong>{provider.displayName}</strong>
                      <small>{channelDescription(provider.platform, locale)}</small>
                      <em>{connected ? t("重新授权", "Reconnect") : actionText}</em>
                    </button>

                    {connected && account ? (
                      <button
                        className="channel-card-disconnect"
                        disabled={disconnectingChannelId === account.id}
                        onClick={() => disconnectChannel(account)}
                        type="button"
                      >
                        {t("解除绑定", "Disconnect")}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
