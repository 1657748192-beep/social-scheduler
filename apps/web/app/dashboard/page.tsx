"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { BeijingDateTimePicker } from "../../components/BeijingDateTimePicker";
import {
  apiRequest,
  type CurrentUser,
  type OAuthProviderStatus,
  type OAuthStartResponse,
  type SocialAccount,
  type Workspace,
  type WorkspaceInvitation,
  type WorkspaceMember
} from "../../lib/api";
import { chinaLocalInputToISOString, toChinaDatetimeLocalValue } from "../../lib/chinaTime";
import {
  accountStatusLabel,
  invitationStatusLabel,
  memberStatusLabel,
  platformLabel,
  roleLabel
} from "../../lib/labels";

type DemoScheduleResponse = {
  scheduleId: string;
  publishJobId: string;
  scheduledAt: string;
  queueDelayMs: number;
};

function createDefaultScheduleTime() {
  const date = new Date(Date.now() + 60_000);
  date.setSeconds(0, 0);
  return toChinaDatetimeLocalValue(date);
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [oauthStatuses, setOAuthStatuses] = useState<OAuthProviderStatus[]>([]);
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdJob, setCreatedJob] = useState<DemoScheduleResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoScheduledAt, setDemoScheduledAt] = useState(createDefaultScheduleTime);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const canManageMembers =
    selectedWorkspace?.role === "owner" || selectedWorkspace?.role === "admin";

  async function loadAccount(storedToken: string) {
    const [currentUser, workspaceList] = await Promise.all([
      apiRequest<CurrentUser>("/auth/me", { token: storedToken }),
      apiRequest<Workspace[]>("/workspaces", { token: storedToken })
    ]);

    setUser(currentUser);
    setWorkspaces(workspaceList);
    setSelectedWorkspaceId((current) => current || workspaceList[0]?.id || "");
  }

  async function loadWorkspaceDetails(storedToken: string, workspaceId: string) {
    const [memberList, invitationList, socialAccountList, oauthStatusList] = await Promise.all([
      apiRequest<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`, { token: storedToken }),
      canManageMembers
        ? apiRequest<WorkspaceInvitation[]>(`/workspaces/${workspaceId}/invitations`, {
            token: storedToken
          })
        : Promise.resolve([]),
      apiRequest<SocialAccount[]>(`/workspaces/${workspaceId}/social-accounts`, {
        token: storedToken
      }),
      apiRequest<OAuthProviderStatus[]>("/integrations/oauth/status", { token: storedToken })
    ]);

    setMembers(memberList);
    setInvitations(invitationList);
    setSocialAccounts(socialAccountList);
    setOAuthStatuses(oauthStatusList);
  }

  useEffect(() => {
    const storedToken = localStorage.getItem("social_scheduler_token");

    if (!storedToken) {
      router.replace("/login");
      return;
    }

    setToken(storedToken);
    loadAccount(storedToken).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
      localStorage.removeItem("social_scheduler_token");
      router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    if (!token || !selectedWorkspaceId) {
      return;
    }

    loadWorkspaceDetails(token, selectedWorkspaceId).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    });
  }, [token, selectedWorkspaceId, canManageMembers]);

  const connectedAccounts = socialAccounts.filter((account) => account.status === "active");
  const configuredProviders = oauthStatuses.filter((provider) => provider.configured);
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
  const facebookAccount = connectedAccounts.find((account) => account.platform === "facebook");
  const facebookPageAccount = connectedAccounts.find(
    (account) => account.platform === "facebook" && account.accountType === "page"
  );
  const facebookBasicAccount = facebookAccount && !facebookPageAccount ? facebookAccount : null;
  const dashboardStats = [
    { label: "工作区", value: workspaces.length, detail: selectedWorkspace?.plan ?? "MVP" },
    { label: "已连接渠道", value: connectedAccounts.length, detail: "可用于排程" },
    { label: "团队成员", value: members.length, detail: "含所有者" },
    { label: "待处理邀请", value: pendingInvitations.length, detail: "等待加入" }
  ];
  const launchChecklist = [
    {
      title: "站点域名与 HTTPS",
      detail: "app.bufferhelp.com 已用于线上访问和平台回调。",
      done: true
    },
    {
      title: "Facebook 开发者配置",
      detail: configuredProviders.some((provider) => provider.platform === "facebook")
        ? "Client ID 和 Secret 已写入服务器。"
        : "还需要配置 Facebook Client ID / Secret。",
      done: configuredProviders.some((provider) => provider.platform === "facebook")
    },
    {
      title: "Facebook Page 授权",
      detail: facebookPageAccount
        ? `已绑定可发布 Page：${facebookPageAccount.displayName}`
        : facebookBasicAccount
          ? "已完成基础绑定，但还不能发布 Page。Meta 通过 Page 权限后需要重新授权。"
          : "需要重新授权并选择要发布的 Page。",
      done: Boolean(facebookPageAccount)
    },
    {
      title: "真实发布测试",
      detail: createdJob ? "已创建测试排程，请到日历查看执行结果。" : "建议先发一条短文案验证发布权限。",
      done: Boolean(createdJob)
    }
  ];

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      return;
    }

    setError(null);
    const formData = new FormData(event.currentTarget);

    try {
      await apiRequest<Workspace>("/workspaces", {
        method: "POST",
        token,
        body: {
          name: String(formData.get("name") ?? ""),
          timezone: String(formData.get("timezone") ?? "Asia/Shanghai")
        }
      });
      event.currentTarget.reset();
      await loadAccount(token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !selectedWorkspace) {
      return;
    }

    setError(null);
    setLatestInviteUrl(null);
    const formData = new FormData(event.currentTarget);

    try {
      const invitation = await apiRequest<WorkspaceInvitation>(
        `/workspaces/${selectedWorkspace.id}/invitations`,
        {
          method: "POST",
          token,
          body: {
            email: String(formData.get("email") ?? ""),
            role: String(formData.get("role") ?? "viewer")
          }
        }
      );

      setLatestInviteUrl(invitation.inviteUrl ?? null);
      event.currentTarget.reset();
      await loadWorkspaceDetails(token, selectedWorkspace.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    }
  }

  async function connectSocialAccount(platform: OAuthProviderStatus["platformParam"]) {
    if (!token || !selectedWorkspace) {
      return;
    }

    setError(null);

    try {
      const response = await apiRequest<OAuthStartResponse>(
        `/integrations/${platform}/oauth/start?workspaceId=${selectedWorkspace.id}`,
        {
          token
        }
      );

      window.location.href = response.authorizationUrl;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    }
  }

  async function disconnectSocialAccount(accountId: string) {
    if (!token || !selectedWorkspace) {
      return;
    }

    setError(null);

    try {
      await apiRequest(`/workspaces/${selectedWorkspace.id}/social-accounts/${accountId}`, {
        method: "DELETE",
        token
      });
      await loadWorkspaceDetails(token, selectedWorkspace.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    }
  }

  async function createDemoSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !selectedWorkspace) {
      return;
    }

    setError(null);
    setCreatedJob(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const scheduledAtLocal = String(formData.get("scheduledAt") ?? "");
    const scheduledAt = chinaLocalInputToISOString(scheduledAtLocal);

    try {
      const response = await apiRequest<DemoScheduleResponse>("/schedules/demo", {
        method: "POST",
        token,
        body: {
          workspaceId: selectedWorkspace.id,
          text: String(formData.get("text") ?? ""),
          platform: String(formData.get("platform") ?? "x"),
          scheduledAt
        }
      });

      setCreatedJob(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell
      title="控制台"
      subtitle="工作区、成员、账号绑定与发布准备"
      userLabel={user ? `${user.name} - ${user.email}` : "正在加载账号"}
    >
      <div className="dashboard">
        {error ? <p className="error">{error}</p> : null}

        <section className="dashboard-hero">
          <div>
            <p className="section-kicker">运营总览</p>
            <h2>{selectedWorkspace?.name ?? "选择一个工作区"}</h2>
            <p className="muted">把账号授权、成员协作、内容排程放在同一个工作台里处理。</p>
          </div>
          <div className="hero-actions">
            <a className="button secondary" href="#social-channels">
              管理渠道
            </a>
            <a className="button" href="/composer">
              新建内容
            </a>
          </div>
        </section>

        <section className="metric-grid" aria-label="运营指标">
          {dashboardStats.map((item) => (
            <article className="metric-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </section>

        <div className="dashboard-layout">
          <section className="panel workspace-panel">
            <div className="row">
              <h2>工作区</h2>
              <span className="muted">{workspaces.length} 个</span>
            </div>

            <label className="field">
              <span>当前工作区</span>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => setSelectedWorkspaceId(event.target.value)}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({roleLabel(workspace.role)})
                  </option>
                ))}
              </select>
            </label>

            <form className="inline-form" onSubmit={createWorkspace}>
              <input name="name" placeholder="新工作区名称" required />
              <button className="button" type="submit">
                创建
              </button>
              <input name="timezone" type="hidden" value="Asia/Shanghai" />
            </form>

            <ul className="list compact-list">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <strong>{workspace.name}</strong>
                  <div className="muted">
                    {workspace.slug} · {roleLabel(workspace.role)}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="row">
              <h2>成员</h2>
              <span className="muted">{members.length} 人</span>
            </div>

            <ul className="list compact-list">
              {members.map((member) => (
                <li key={member.id}>
                  <strong>{member.name}</strong>
                  <div className="muted">
                    {member.email} · {roleLabel(member.role)} · {memberStatusLabel(member.status)}
                  </div>
                </li>
              ))}
            </ul>

            {canManageMembers ? (
              <div className="invite-box">
                <h3>邀请成员</h3>
                <form className="form tight-form" onSubmit={inviteMember}>
                  <label className="field">
                    <span>电子邮箱</span>
                    <input name="email" type="email" required />
                  </label>
                  <label className="field">
                    <span>权限</span>
                    <select name="role" defaultValue="viewer">
                      <option value="admin">管理员</option>
                      <option value="editor">编辑者</option>
                      <option value="viewer">查看者</option>
                    </select>
                  </label>
                  <button className="button" type="submit">
                    创建邀请
                  </button>
                </form>
                {latestInviteUrl ? <code className="code">{latestInviteUrl}</code> : null}
              </div>
            ) : null}
          </section>

          <section className="panel checklist-panel">
            <div className="row">
              <h2>发布准备清单</h2>
              <span className="muted">
                {launchChecklist.filter((item) => item.done).length}/{launchChecklist.length}
              </span>
            </div>
            <ul className="check-list">
              {launchChecklist.map((item) => (
                <li className={item.done ? "done" : ""} key={item.title}>
                  <span>{item.done ? "✓" : "!"}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel quick-schedule">
            <h2>快速排程内容</h2>
            <p className="muted">用于快速验证队列和平台发布权限。正式内容建议到内容编辑器创建。</p>

            <form className="form tight-form" onSubmit={createDemoSchedule}>
              <label className="field">
                <span>平台</span>
                <select name="platform" defaultValue="facebook">
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="x">Twitter / X</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </label>

              <label className="field">
                <span>内容</span>
                <textarea name="text" defaultValue="这是一条待发布的测试内容。" required />
              </label>

              <label className="field">
                <span>北京时间</span>
                <BeijingDateTimePicker
                  min={toChinaDatetimeLocalValue(new Date())}
                  name="scheduledAt"
                  onChange={setDemoScheduledAt}
                  required
                  value={demoScheduledAt}
                />
              </label>
              <p className="muted">按北京时间 UTC+8 保存，使用 24 小时制。</p>

              <button className="button" disabled={isSubmitting || !selectedWorkspace} type="submit">
                {isSubmitting ? "排程中" : "加入排程"}
              </button>
            </form>

            {createdJob ? (
              <div className="result-box">
                <strong>已创建发布任务</strong>
                <span>排程：{createdJob.scheduleId}</span>
                <span>任务：{createdJob.publishJobId}</span>
              </div>
            ) : null}
          </section>
        </div>

        <section className="panel channel-management" id="social-channels">
          <div className="row">
            <div>
              <p className="section-kicker">渠道管理</p>
              <h2>连接与授权状态</h2>
            </div>
            <span className="muted">{socialAccounts.length} 个账号</span>
          </div>

          {canManageMembers ? (
            <div className="provider-grid">
              {oauthStatuses.map((provider) => {
                const account = socialAccounts.find(
                  (item) => item.platform === provider.platform && item.status === "active"
                );
                const facebookBasicMode =
                  provider.platform === "facebook" && !provider.scopes.includes("pages_manage_posts");

                return (
                  <article className="provider-card" key={provider.platform}>
                    <div className="row">
                      <div>
                        <strong>{provider.displayName}</strong>
                        <p className="muted">{account ? account.displayName : "尚未绑定账号"}</p>
                      </div>
                      <span className={provider.configured ? "status-pill ready" : "status-pill warning"}>
                        {provider.configured ? "已配置" : "未配置"}
                      </span>
                    </div>

                    {provider.platform === "facebook" ? (
                      <div className="oauth-config-box">
                        <span>当前模式</span>
                        <code>
                          {facebookBasicMode
                            ? "基础绑定：可登录授权，暂不能发布 Facebook Page"
                            : "Page 发布：可请求主页列表与发帖权限"}
                        </code>
                      </div>
                    ) : null}

                    <div className="provider-actions">
                      <button
                        className="button"
                        disabled={!provider.configured}
                        onClick={() => connectSocialAccount(provider.platformParam)}
                        type="button"
                      >
                        {account ? "重新授权" : provider.configured ? "去授权" : "等待配置"}
                      </button>
                      {account ? (
                        <button
                          className="button danger-button"
                          onClick={() => disconnectSocialAccount(account.id)}
                          type="button"
                        >
                          解除绑定
                        </button>
                      ) : null}
                    </div>

                    <div className="oauth-links">
                      <a href={provider.developerUrl} rel="noreferrer" target="_blank">
                        开发者后台
                      </a>
                      <a href={provider.docsUrl} rel="noreferrer" target="_blank">
                        配置文档
                      </a>
                    </div>

                    <div className="oauth-config-box">
                      <span>OAuth 回调地址</span>
                      <code>{provider.redirectUri}</code>
                    </div>

                    {!provider.configured ? (
                      <div className="oauth-config-box">
                        <span>服务器需要配置</span>
                        <code>{provider.requiredEnv.join(" / ")}</code>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!oauthStatuses.length ? <p className="muted">正在读取平台配置状态。</p> : null}
            </div>
          ) : (
            <p className="muted">只有所有者和管理员可以绑定社交账号。</p>
          )}

          <div className="connected-table">
            <div className="connected-table-head">
              <span>平台</span>
              <span>账号</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            {socialAccounts.map((account) => (
              <div className="connected-table-row" key={account.id}>
                <span>{platformLabel(account.platform)}</span>
                <strong>{account.displayName}</strong>
                <span>{accountStatusLabel(account.status)}</span>
                <span>
                  {canManageMembers ? (
                    <button
                      className="text-button danger-text"
                      type="button"
                      onClick={() => disconnectSocialAccount(account.id)}
                    >
                      解除绑定
                    </button>
                  ) : (
                    "-"
                  )}
                </span>
              </div>
            ))}
            {!socialAccounts.length ? (
              <div className="connected-table-row empty-row">暂未绑定社交账号</div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="row">
            <h2>待处理邀请</h2>
            <span className="muted">{pendingInvitations.length} 个</span>
          </div>
          <ul className="list compact-list">
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <strong>{invitation.email}</strong>
                <div className="muted">
                  {roleLabel(invitation.role)} · {invitationStatusLabel(invitation.status)}
                </div>
              </li>
            ))}
            {!invitations.length ? <li className="muted">暂无邀请</li> : null}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
