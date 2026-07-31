"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import {
  apiRequest,
  type CurrentUser,
  type OAuthAuthorizationLink,
  type OAuthProviderStatus,
  type OAuthStartResponse,
  type SocialAccount,
  type Workspace,
  type WorkspaceInvitation,
  type WorkspaceMember
} from "../../lib/api";
import {
  accountStatusLabel,
  invitationStatusLabel,
  memberStatusLabel,
  platformLabel,
  roleLabel
} from "../../lib/labels";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../lib/activeWorkspace";
import { useLanguage } from "../../components/LanguageProvider";

function publishingAccessLabel(status?: Workspace["publishingAccessStatus"]) {
  if (status === "disabled") {
    return "发布权限已停用";
  }

  if (status === "expired") {
    return "测试发布权限已到期";
  }

  return "测试发布权限生效中";
}

function formatBeijingDateTime(value?: string | null) {
  if (!value) {
    return "未设置";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

function publishingAccessDescription(
  status?: Workspace["publishingAccessStatus"],
  expiresAt?: string | null
) {
  if (status === "disabled") {
    return "管理员已停用你的发布权限。你仍可登录、查看后台和保存草稿，但不能上传素材、立即发布或创建排程。";
  }

  if (status === "expired") {
    return "测试期限已结束。你仍可登录、查看后台和保存草稿，但不能上传素材、立即发布或创建排程。";
  }

  return `可发布至 ${formatBeijingDateTime(expiresAt)}（北京时间）。到期后仍可登录查看后台和保存草稿，但不能发布或创建排程。`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [oauthStatuses, setOAuthStatuses] = useState<OAuthProviderStatus[]>([]);
  const [authorizationLinks, setAuthorizationLinks] = useState<
    Record<string, OAuthAuthorizationLink>
  >({});
  const [bindingProvider, setBindingProvider] = useState<OAuthProviderStatus | null>(null);
  const [creatingAuthorizationLink, setCreatingAuthorizationLink] = useState<string | null>(null);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setSelectedWorkspaceId((current) => getActiveWorkspaceId(workspaceList, current));
  }

  function selectWorkspace(workspaceId: string) {
    setActiveWorkspaceId(workspaceId);
    setSelectedWorkspaceId(workspaceId);
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
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
  const dashboardStats = [
    { label: t("工作区", "Workspaces"), value: workspaces.length, detail: selectedWorkspace?.plan ?? "MVP" },
    { label: t("已连接渠道", "Connected channels"), value: connectedAccounts.length, detail: t("可用于排程", "Ready for scheduling") },
    { label: t("团队成员", "Team members"), value: members.length, detail: t("含所有者", "Including owner") },
    { label: t("待处理邀请", "Pending invitations"), value: pendingInvitations.length, detail: t("等待加入", "Waiting to join") }
  ];
  const bindingProviderAccounts = bindingProvider
    ? connectedAccounts.filter((account) => account.platform === bindingProvider.platform)
    : [];
  const bindingShareLink = bindingProvider ? authorizationLinks[bindingProvider.platform] : undefined;

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!token) {
      return;
    }

    setError(null);
    const formData = new FormData(form);

    try {
      await apiRequest<Workspace>("/workspaces", {
        method: "POST",
        token,
        body: {
          name: String(formData.get("name") ?? ""),
          timezone: String(formData.get("timezone") ?? "Asia/Shanghai")
        }
      });
      form.reset();
      await loadAccount(token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!token || !selectedWorkspace) {
      return;
    }

    setError(null);
    setLatestInviteUrl(null);
    const formData = new FormData(form);

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
      form.reset();
      await loadWorkspaceDetails(token, selectedWorkspace.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    }
  }

  async function toggleMemberStatus(member: WorkspaceMember) {
    if (!token || !selectedWorkspace || member.role === "owner") {
      return;
    }

    const nextStatus = member.status === "disabled" ? "active" : "disabled";
    const actionLabel = nextStatus === "disabled" ? t("停用", "disable") : t("恢复", "restore");

    if (!window.confirm(t(`确定要${actionLabel}成员 ${member.email} 吗？`, `Are you sure you want to ${actionLabel} ${member.email}?`))) {
      return;
    }

    setError(null);
    setMemberActionId(member.id);

    try {
      await apiRequest<WorkspaceMember>(
        `/workspaces/${selectedWorkspace.id}/members/${member.id}`,
        {
          method: "PATCH",
          token,
          body: { status: nextStatus }
        }
      );
      await loadWorkspaceDetails(token, selectedWorkspace.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("无法更新成员状态", "Unable to update member status"));
    } finally {
      setMemberActionId(null);
    }
  }

  async function removeMember(member: WorkspaceMember) {
    if (!token || !selectedWorkspace || member.role === "owner") {
      return;
    }

    if (!window.confirm(t(`确定从当前工作区移除 ${member.email} 吗？对方账号和自己的工作区不会被删除。`, `Remove ${member.email} from this workspace? Their account and personal workspaces will not be deleted.`))) {
      return;
    }

    setError(null);
    setMemberActionId(member.id);

    try {
      await apiRequest<{ ok: true }>(
        `/workspaces/${selectedWorkspace.id}/members/${member.id}`,
        {
          method: "DELETE",
          token
        }
      );
      await loadWorkspaceDetails(token, selectedWorkspace.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("无法移除成员", "Unable to remove member"));
    } finally {
      setMemberActionId(null);
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

  async function createAuthorizationShareLink(provider: OAuthProviderStatus) {
    if (!token || !selectedWorkspace) {
      return;
    }

    setError(null);
    setCreatingAuthorizationLink(provider.platform);

    try {
      const link = await apiRequest<OAuthAuthorizationLink>(
        `/workspaces/${selectedWorkspace.id}/social-accounts/authorization-links`,
        {
          method: "POST",
          token,
          body: {
            platform: provider.platform
          }
        }
      );

      setAuthorizationLinks((current) => ({
        ...current,
        [provider.platform]: link
      }));

      if (link.shareUrl) {
        await navigator.clipboard?.writeText(link.shareUrl).catch(() => null);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成分享授权链接失败");
    } finally {
      setCreatingAuthorizationLink(null);
    }
  }

  async function copyAuthorizationShareLink(link: OAuthAuthorizationLink) {
    if (!link.shareUrl) {
      return;
    }

    await navigator.clipboard?.writeText(link.shareUrl).catch(() => null);
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

  return (
    <AppShell
      title={t("控制台", "Dashboard")}
      subtitle={t("工作区、成员、账号绑定与发布准备", "Workspaces, members, account connections, and publishing readiness")}
      userLabel={user ? `${user.name} - ${user.email}` : "正在加载账号"}
    >
      <div className="dashboard">
        {error ? <p className="error">{error}</p> : null}

        <section className="dashboard-hero">
          <div>
            <p className="section-kicker">{t("运营总览", "Overview")}</p>
            <h2>{selectedWorkspace?.name ?? t("选择一个工作区", "Select a workspace")}</h2>
            <p className="muted">{t("把账号授权、成员协作、内容排程放在同一个工作台里处理。", "Manage account authorization, team collaboration, and content scheduling in one workspace.")}</p>
          </div>
          <div className="hero-actions">
            <a className="button secondary" href="#social-channels">
              {t("管理渠道", "Manage channels")}
            </a>
            <a className="button" href="/composer">
              {t("新建内容", "New content")}
            </a>
          </div>
        </section>

        {selectedWorkspace?.publishingAccessExpiresAt ||
        selectedWorkspace?.publishingAccessStatus === "disabled" ||
        selectedWorkspace?.publishingAccessStatus === "expired" ? (
          <section
            className={`publishing-access-notice ${
              selectedWorkspace?.publishingAccessStatus === "active" ? "ready" : "warning"
            }`}
          >
            <div>
            <p className="section-kicker">{t("测试人员发布权限", "Tester publishing access")}</p>
              <h2>{publishingAccessLabel(selectedWorkspace?.publishingAccessStatus)}</h2>
              <p className="muted">
                {publishingAccessDescription(
                  selectedWorkspace?.publishingAccessStatus,
                  selectedWorkspace?.publishingAccessExpiresAt
                )}
              </p>
            </div>
            <span
              className={`status-pill ${
                selectedWorkspace?.publishingAccessStatus === "active" ? "ready" : "warning"
              }`}
            >
              {selectedWorkspace?.publishingAccessStatus === "active"
                ? `截止：${formatBeijingDateTime(selectedWorkspace.publishingAccessExpiresAt)}`
                : publishingAccessLabel(selectedWorkspace?.publishingAccessStatus)}
            </span>
          </section>
        ) : null}

        <section className="metric-grid" aria-label={t("运营指标", "Overview metrics")}>
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
              <h2>{t("工作区", "Workspaces")}</h2>
              <span className="muted">{t(`${workspaces.length} 个`, `${workspaces.length}`)}</span>
            </div>

            <label className="field">
              <span>{t("当前工作区", "Current workspace")}</span>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => selectWorkspace(event.target.value)}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({roleLabel(workspace.role)})
                  </option>
                ))}
              </select>
            </label>

            <form className="inline-form" onSubmit={createWorkspace}>
              <input name="name" placeholder={t("新工作区名称", "New workspace name")} required />
              <button className="button" type="submit">
                {t("创建", "Create")}
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
              <h2>{t("成员", "Members")}</h2>
              <span className="muted">{t(`${members.length} 人`, `${members.length}`)}</span>
            </div>

            <ul className="list compact-list">
              {members.map((member) => (
                <li className="workspace-member-row" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <div className="muted">
                      {member.email} · {roleLabel(member.role)} · {memberStatusLabel(member.status)}
                    </div>
                  </div>
                  {canManageMembers && member.role !== "owner" ? (
                    <div className="workspace-member-actions">
                      <button
                        className="button secondary"
                        disabled={memberActionId === member.id}
                        onClick={() => toggleMemberStatus(member)}
                        type="button"
                      >
                        {member.status === "disabled" ? t("恢复成员", "Restore") : t("停用成员", "Disable")}
                      </button>
                      <button
                        className="button danger-button"
                        disabled={memberActionId === member.id}
                        onClick={() => removeMember(member)}
                        type="button"
                      >
                        {t("移除成员", "Remove")}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {canManageMembers ? (
              <div className="invite-box">
                <h3>{t("邀请成员", "Invite member")}</h3>
                <form className="form tight-form" onSubmit={inviteMember}>
                  <label className="field">
                    <span>{t("电子邮箱", "Email")}</span>
                    <input name="email" type="email" required />
                  </label>
                  <label className="field">
                    <span>{t("权限", "Role")}</span>
                    <select name="role" defaultValue="viewer">
                      <option value="admin">{t("管理员", "Admin")}</option>
                      <option value="editor">{t("编辑者", "Editor")}</option>
                      <option value="viewer">{t("查看者", "Viewer")}</option>
                    </select>
                  </label>
                  <button className="button" type="submit">
                    {t("创建邀请", "Create invitation")}
                  </button>
                </form>
                {latestInviteUrl ? <code className="code">{latestInviteUrl}</code> : null}
              </div>
            ) : null}
          </section>

        </div>

        <section className="panel channel-management" id="social-channels">
          <div className="row">
            <div>
              <p className="section-kicker">{t("渠道管理", "Channel management")}</p>
              <h2>{t("连接与授权状态", "Connection and authorization")}</h2>
            </div>
            <span className="muted">{t(`${socialAccounts.length} 个账号`, `${socialAccounts.length} accounts`)}</span>
          </div>

          {canManageMembers ? (
            <div className="provider-grid">
              {oauthStatuses.map((provider) => {
                const providerAccounts = socialAccounts.filter(
                  (item) => item.platform === provider.platform && item.status === "active"
                );
                const shareLink = authorizationLinks[provider.platform];
                return (
                  <article className="provider-card" key={provider.platform}>
                    <div className="row">
                      <div>
                        <strong>{provider.displayName}</strong>
                        <p className="muted">
                          {providerAccounts.length
                            ? t(`${providerAccounts.length} 个账号已绑定`, `${providerAccounts.length} accounts connected`)
                            : t("尚未绑定账号", "No account connected")}
                        </p>
                      </div>
                      <span className={provider.configured ? "status-pill ready" : "status-pill warning"}>
                        {provider.configured ? t("已配置", "Configured") : t("未配置", "Not configured")}
                      </span>
                    </div>

                    {providerAccounts.length ? (
                      <div className="provider-account-list">
                        {providerAccounts.map((account) => (
                          <span className="provider-account-chip" key={account.id}>
                            <span>{account.displayName}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="provider-actions">
                      <button
                        className="button"
                        disabled={!provider.configured}
                        onClick={() => setBindingProvider(provider)}
                        type="button"
                      >
                        {provider.configured ? t("添加账号", "Add account") : t("等待配置", "Waiting for configuration")}
                      </button>
                      <button
                        className="button secondary"
                        disabled={!provider.configured || creatingAuthorizationLink === provider.platform}
                        onClick={() => createAuthorizationShareLink(provider)}
                        type="button"
                      >
                        {creatingAuthorizationLink === provider.platform ? t("生成中", "Generating...") : t("分享授权", "Share authorization")}
                      </button>
                      {providerAccounts.map((account) => (
                        <button
                          className="button danger-button"
                          key={account.id}
                          onClick={() => disconnectSocialAccount(account.id)}
                          type="button"
                        >
                          {account.status === "disconnected" ? t("删除记录", "Delete record") : t("解除绑定", "Disconnect")} {account.displayName}
                        </button>
                      ))}
                    </div>

                    {shareLink?.shareUrl ? (
                      <div className="oauth-config-box share-link-box">
                        <span>{t("24 小时授权链接", "24-hour authorization link")}</span>
                        <div className="share-link-row">
                          <input readOnly value={shareLink.shareUrl} />
                          <button
                            className="button secondary"
                            onClick={() => copyAuthorizationShareLink(shareLink)}
                            type="button"
                          >
                            {t("复制", "Copy")}
                          </button>
                        </div>
                        <small className="muted">
                          到期时间：{new Date(shareLink.expiresAt).toLocaleString("zh-CN", {
                            hour12: false,
                            timeZone: "Asia/Shanghai"
                          })}
                        </small>
                      </div>
                    ) : null}

                  </article>
                );
              })}
              {!oauthStatuses.length ? <p className="muted">{t("正在读取平台配置状态。", "Loading platform configuration...")}</p> : null}
            </div>
          ) : (
            <p className="muted">{t("只有所有者和管理员可以绑定社交账号。", "Only owners and admins can connect social accounts.")}</p>
          )}

          <div className="connected-table">
            <div className="connected-table-head">
              <span>{t("平台", "Platform")}</span>
              <span>{t("账号", "Account")}</span>
              <span>{t("状态", "Status")}</span>
              <span>{t("操作", "Actions")}</span>
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
                      {account.status === "disconnected" ? t("删除记录", "Delete record") : t("解除绑定", "Disconnect")}
                    </button>
                  ) : (
                    "-"
                  )}
                </span>
              </div>
            ))}
            {!socialAccounts.length ? (
              <div className="connected-table-row empty-row">{t("暂未绑定社交账号", "No social accounts connected")}</div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="row">
            <h2>{t("待处理邀请", "Pending invitations")}</h2>
            <span className="muted">{t(`${pendingInvitations.length} 个`, `${pendingInvitations.length}`)}</span>
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
            {!invitations.length ? <li className="muted">{t("暂无邀请", "No invitations")}</li> : null}
          </ul>
        </section>

        {bindingProvider ? (
          <div
            className="channel-modal-backdrop"
            onClick={() => setBindingProvider(null)}
            role="presentation"
          >
            <section
              aria-modal="true"
              className="channel-modal binding-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="channel-modal-header">
                <div>
                  <h2>{t(`连接到 ${bindingProvider.displayName} 账号`, `Connect a ${bindingProvider.displayName} account`)}</h2>
                  <p>{t("选择直接授权，或生成 24 小时分享授权链接给别人绑定。", "Authorize directly, or generate a 24-hour sharing link for someone else to connect an account.")}</p>
                </div>
                <button aria-label={t("关闭", "Close")} onClick={() => setBindingProvider(null)} type="button">
                  ×
                </button>
              </div>

              <div className="binding-modal-body">
                <div className="binding-modal-hero">
                  <div className={`channel-card-icon ${bindingProvider.platform}`}>
                    {platformLabel(bindingProvider.platform).slice(0, 1)}
                  </div>
                  <div>
                    <strong>{bindingProvider.displayName}</strong>
                    <p className="muted">
                      {bindingProvider.configured
                        ? t("已接入平台 OAuth，可继续添加多个账号。", "Platform OAuth is connected. You can add multiple accounts.")
                        : t("服务器暂未配置该平台的 Client ID / Secret。", "This platform's Client ID / Secret is not configured on the server.")}
                    </p>
                  </div>
                  <span className={bindingProvider.configured ? "status-pill ready" : "status-pill warning"}>
                    {bindingProvider.configured ? t("已配置", "Configured") : t("未配置", "Not configured")}
                  </span>
                </div>

                <div className="binding-modal-section">
                  <div className="row">
                    <h3>{t("已绑定账号", "Connected accounts")}</h3>
                    <span className="muted">{t(`${bindingProviderAccounts.length} 个`, `${bindingProviderAccounts.length}`)}</span>
                  </div>
                  {bindingProviderAccounts.length ? (
                    <div className="binding-account-list">
                      {bindingProviderAccounts.map((account) => (
                        <div className="binding-account-item" key={account.id}>
                          <div>
                            <strong>{account.displayName}</strong>
                            <small className="muted">
                              {account.accountType ?? "account"} · {accountStatusLabel(account.status)}
                            </small>
                          </div>
                          <button
                            className="text-button danger-text"
                            onClick={() => disconnectSocialAccount(account.id)}
                            type="button"
                          >
                            {account.status === "disconnected" ? t("删除记录", "Delete record") : t("解除绑定", "Disconnect")}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">{t("当前平台还没有绑定账号。", "No account is connected for this platform yet.")}</p>
                  )}
                </div>

                <div className="binding-action-panel">
                  <div>
                    <strong>{t("官方授权登录", "Official authorization")}</strong>
                    <p className="muted">{t("点击后会跳转到平台官方 OAuth 页面完成授权。", "Continue to the platform's official OAuth page to authorize access.")}</p>
                  </div>
                  <button
                    className="button"
                    disabled={!bindingProvider.configured}
                    onClick={() => connectSocialAccount(bindingProvider.platformParam)}
                    type="button"
                  >
                    {t("立即连接", "Connect now")}
                  </button>
                </div>

                <div className="binding-action-panel">
                  <div>
                    <strong>{t("分享授权链接", "Share authorization link")}</strong>
                    <p className="muted">{t("复制给对方后，对方 24 小时内打开即可授权绑定到当前工作区。", "Anyone who opens this link within 24 hours can authorize an account for this workspace.")}</p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={
                      !bindingProvider.configured || creatingAuthorizationLink === bindingProvider.platform
                    }
                    onClick={() => createAuthorizationShareLink(bindingProvider)}
                    type="button"
                  >
                    {creatingAuthorizationLink === bindingProvider.platform ? t("生成中", "Generating...") : t("生成链接", "Generate link")}
                  </button>
                </div>

                {bindingShareLink?.shareUrl ? (
                  <div className="oauth-config-box share-link-box">
                    <span>{t("24 小时授权链接", "24-hour authorization link")}</span>
                    <div className="share-link-row">
                      <input readOnly value={bindingShareLink.shareUrl} />
                      <button
                        className="button secondary"
                        onClick={() => copyAuthorizationShareLink(bindingShareLink)}
                        type="button"
                      >
                        {t("复制", "Copy")}
                      </button>
                    </div>
                    <small className="muted">
                      到期时间：{new Date(bindingShareLink.expiresAt).toLocaleString("zh-CN", {
                        hour12: false,
                        timeZone: "Asia/Shanghai"
                      })}
                    </small>
                  </div>
                ) : null}

              </div>
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
