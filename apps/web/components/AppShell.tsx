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

type AppShellProps = {
  title: string;
  subtitle?: string;
  userLabel?: string;
  wide?: boolean;
  children: ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "控制台", helper: "工作区与渠道" },
  { href: "/composer", label: "内容编辑", helper: "文案与素材" },
  { href: "/calendar", label: "排程日历", helper: "周/月计划" }
];

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

function channelDescription(platform: SidebarProvider["platform"]) {
  const descriptions: Record<SidebarProvider["platform"], string> = {
    instagram: "图片、短视频与 Reels",
    linkedin: "个人主页或公司主页",
    facebook: "公共主页发布",
    youtube: "频道视频发布",
    tiktok: "短视频账号",
    pinterest: "图钉与看板",
    x: "短文与动态"
  };

  return descriptions[platform];
}

function channelStatusText(account: SocialAccount | undefined, provider: SidebarProvider) {
  if (account?.status === "active") {
    return account.displayName || "已连接";
  }

  if (account?.status === "token_expired") {
    return "授权已过期";
  }

  if (account?.status === "disconnected") {
    return "已断开";
  }

  return provider.configured ? "可一键授权" : "待配置";
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
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [channels, setChannels] = useState<SocialAccount[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<OAuthProviderStatus[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [channelActionError, setChannelActionError] = useState<string | null>(null);

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
  const connectedCount = channels.filter((account) => account.status === "active").length;
  const totalPrimaryChannels = sidebarProviders.length;
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
          新建内容
        </Link>

        <nav className="software-nav" aria-label="主导航">
          {navItems.map((item) => (
            <Link
              className={pathname === item.href ? "active" : ""}
              href={item.href}
              key={item.href}
            >
              <strong>{item.label}</strong>
              <small>{item.helper}</small>
            </Link>
          ))}
        </nav>

        <section className="software-channels" aria-label="连接通道">
          <div className="channels-heading">
            <span>连接通道</span>
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
                <button
                  className={rowClassName}
                  key={provider.platform}
                  onClick={() => openChannel(provider, account)}
                  type="button"
                >
                  <span className={`channel-icon ${provider.platform}`}>
                    {channelInitial(provider.platform)}
                  </span>
                  <span className="channel-copy">
                    <strong>{provider.displayName}</strong>
                    <small>{channelStatusText(account, provider)}</small>
                  </span>
                </button>
              );
            })}

            {channelsLoading ? <span className="channels-empty">正在读取通道</span> : null}

            <button
              className="channel-more"
              onClick={() => setIsChannelModalOpen(true)}
              type="button"
            >
              <span className="channel-icon more">+</span>
              <span>更多通道</span>
            </button>
          </div>
        </section>

        <div className="channel-progress">
          <div className="row">
            <strong>渠道状态</strong>
            <span>
              {connectedCount}/{totalPrimaryChannels}
            </span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${(connectedCount / Math.max(totalPrimaryChannels, 1)) * 100}%` }} />
          </div>
        </div>

        <div className="software-sidebar-footer">
          <span>{userLabel || "已登录"}</span>
          <button className="button secondary" onClick={signOut} type="button">
            退出登录
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
            <Link className="button secondary" href="/dashboard#social-channels">
              连接渠道
            </Link>
            <Link className="button secondary" href="/calendar">
              查看日历
            </Link>
            <Link className="button" href="/composer">
              新建内容
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
                <h2>连接新频道</h2>
                <p>选择平台后会跳转到对应平台登录授权页面。</p>
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
                  ? "已连接，点击查看"
                  : provider.configured
                    ? "点击授权"
                    : "待配置密钥";

                return (
                  <button
                    className={connected ? "channel-card connected" : "channel-card"}
                    key={provider.platform}
                    onClick={() => openChannel(provider, account)}
                    type="button"
                  >
                    <span className={`channel-card-icon ${provider.platform}`}>
                      {channelInitial(provider.platform)}
                    </span>
                    <strong>{provider.displayName}</strong>
                    <small>{channelDescription(provider.platform)}</small>
                    <em>{actionText}</em>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
