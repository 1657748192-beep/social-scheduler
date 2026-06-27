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
  { href: "/dashboard", label: "控制台" },
  { href: "/composer", label: "内容编辑" },
  { href: "/calendar", label: "排程日历" }
];

type SidebarProvider = Pick<
  OAuthProviderStatus,
  "platform" | "platformParam" | "displayName" | "configured"
>;

const defaultChannelProviders: SidebarProvider[] = [
  {
    platform: "instagram",
    platformParam: "instagram",
    displayName: "Instagram",
    configured: false
  },
  {
    platform: "facebook",
    platformParam: "facebook",
    displayName: "Facebook",
    configured: false
  },
  {
    platform: "x",
    platformParam: "twitter",
    displayName: "X / Twitter",
    configured: false
  }
];

function channelInitial(platform: SidebarProvider["platform"]) {
  const initials: Record<SidebarProvider["platform"], string> = {
    instagram: "IG",
    facebook: "f",
    x: "X"
  };

  return initials[platform];
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

export function AppShell({ title, subtitle, userLabel, wide = false, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [channels, setChannels] = useState<SocialAccount[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<OAuthProviderStatus[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

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

  const channelProviders = providerStatuses.length ? providerStatuses : defaultChannelProviders;
  const channelItems = useMemo(
    () =>
      channelProviders.map((provider) => ({
        provider,
        account: channels.find((account) => account.platform === provider.platform)
      })),
    [channelProviders, channels]
  );

  async function openChannel(provider: SidebarProvider, account?: SocialAccount) {
    const canStartAuthorization = provider.configured && workspaceId && account?.status !== "active";
    const token = localStorage.getItem("social_scheduler_token");

    if (!canStartAuthorization || !token) {
      router.push("/dashboard#social-channels");
      return;
    }

    try {
      const response = await apiRequest<OAuthStartResponse>(
        `/integrations/${provider.platformParam}/oauth/start?workspaceId=${workspaceId}`,
        { token }
      );
      window.location.href = response.authorizationUrl;
    } catch {
      router.push("/dashboard#social-channels");
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

        <nav className="software-nav">
          {navItems.map((item) => (
            <Link
              className={pathname === item.href ? "active" : ""}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <section className="software-channels" aria-label="连接通道">
          <div className="channels-heading">
            <span>连接通道</span>
            <Link href="/dashboard#social-channels" title="管理连接通道">
              +
            </Link>
          </div>

          <div className="channels-list">
            {channelItems.map(({ provider, account }) => {
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

            <Link className="channel-more" href="/dashboard#social-channels">
              <span className="channel-icon more">+</span>
              <span>更多通道</span>
            </Link>
          </div>

        </section>

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
        </header>

        <div className={wide ? "software-content wide" : "software-content"}>{children}</div>
      </section>
    </main>
  );
}
