"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
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

  const defaultDateTime = useMemo(() => {
    const date = new Date(Date.now() + 60_000);
    date.setSeconds(0, 0);
    return toChinaDatetimeLocalValue(date);
  }, []);

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
      subtitle="工作空间、成员、账号绑定与快速排程"
      userLabel={user ? `${user.name} - ${user.email}` : "正在加载账号"}
    >
      <div className="dashboard">
        {error ? <p className="error">{error}</p> : null}

        <div className="grid">
          <section className="panel">
            <div className="row">
              <h2>工作空间</h2>
              <span className="muted">{workspaces.length}</span>
            </div>

            <label className="field">
              <span>当前工作空间</span>
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
              <input name="name" placeholder="新工作空间名称" required />
              <button className="button" type="submit">
                创建
              </button>
              <input name="timezone" type="hidden" value="Asia/Shanghai" />
            </form>

            <ul className="list">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <strong>{workspace.name}</strong>
                  <div className="muted">
                    {workspace.slug} - {roleLabel(workspace.role)}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="row">
              <h2>成员</h2>
              <span className="muted">{members.length}</span>
            </div>

            <ul className="list">
              {members.map((member) => (
                <li key={member.id}>
                  <strong>{member.name}</strong>
                  <div className="muted">
                    {member.email} - {roleLabel(member.role)} - {memberStatusLabel(member.status)}
                  </div>
                </li>
              ))}
            </ul>

            {canManageMembers ? (
              <>
                <h2>邀请成员</h2>
                <form className="form" onSubmit={inviteMember}>
                  <label className="field">
                    <span>邮箱</span>
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
              </>
            ) : null}
          </section>

          <section className="panel" id="social-channels">
            <div className="row">
              <h2>社交账号</h2>
              <span className="muted">{socialAccounts.length}</span>
            </div>

            {canManageMembers ? (
              <div className="oauth-provider-list">
                {oauthStatuses.map((provider) => (
                  <article className="oauth-provider" key={provider.platform}>
                    <div className="row">
                      <strong>{provider.displayName}</strong>
                      <span className={provider.configured ? "status-pill ready" : "status-pill warning"}>
                        {provider.configured ? "已配置" : "未配置"}
                      </span>
                    </div>

                    <p className="muted">
                      {provider.configured
                        ? "可以跳转到平台授权页面绑定账号。"
                        : "需要先在平台开发者后台创建应用，并把 Client ID / Secret 写入服务器环境变量。"}
                    </p>

                    <button
                      className="button"
                      disabled={!provider.configured}
                      onClick={() => connectSocialAccount(provider.platformParam)}
                      type="button"
                    >
                      {provider.configured ? `绑定 ${provider.displayName}` : "等待配置后绑定"}
                    </button>

                    <div className="oauth-links">
                      <a href={provider.developerUrl} rel="noreferrer" target="_blank">
                        打开开发者后台
                      </a>
                      <a href={provider.docsUrl} rel="noreferrer" target="_blank">
                        查看配置文档
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
                ))}
                {!oauthStatuses.length ? <p className="muted">正在读取平台配置状态。</p> : null}
              </div>
            ) : (
              <p className="muted">只有所有者和管理员可以绑定社交账号。</p>
            )}

            <ul className="list">
              {socialAccounts.map((account) => (
                <li key={account.id}>
                  <div className="row">
                    <div>
                      <strong>{account.displayName}</strong>
                      <div className="muted">
                        {platformLabel(account.platform)} - {accountStatusLabel(account.status)}
                      </div>
                    </div>
                    {canManageMembers ? (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => disconnectSocialAccount(account.id)}
                      >
                        解绑
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
              {!socialAccounts.length ? <li className="muted">暂未绑定社交账号</li> : null}
            </ul>
          </section>

          <section className="panel">
            <h2>待处理邀请</h2>
            <ul className="list">
              {invitations.map((invitation) => (
                <li key={invitation.id}>
                  <strong>{invitation.email}</strong>
                  <div className="muted">
                    {roleLabel(invitation.role)} - {invitationStatusLabel(invitation.status)}
                  </div>
                </li>
              ))}
              {!invitations.length ? <li className="muted">暂无邀请</li> : null}
            </ul>
          </section>

          <section className="panel">
            <h2>快速排程内容</h2>
            <p className="muted">为当前工作空间快速创建一条定时发布任务。</p>

            <form className="form" onSubmit={createDemoSchedule}>
              <label className="field">
                <span>平台</span>
                <select name="platform" defaultValue="x">
                  <option value="x">X / Twitter</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </label>

              <label className="field">
                <span>内容</span>
                <textarea name="text" defaultValue="这是一条待发布内容。" required />
              </label>

              <label className="field">
                <span>发布时间</span>
                <input name="scheduledAt" type="datetime-local" defaultValue={defaultDateTime} />
              </label>
              <p className="muted">按中国时间 UTC+8 保存。</p>

              <button className="button" disabled={isSubmitting || !selectedWorkspace} type="submit">
                {isSubmitting ? "排程中" : "加入排程"}
              </button>
            </form>

            {createdJob ? (
              <ul className="list">
                <li>
                  <strong>排程记录</strong>
                  <div className="muted">{createdJob.scheduleId}</div>
                </li>
                <li>
                  <strong>发布任务</strong>
                  <div className="muted">{createdJob.publishJobId}</div>
                </li>
              </ul>
            ) : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
