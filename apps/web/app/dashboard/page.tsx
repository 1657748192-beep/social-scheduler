"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import {
  apiRequest,
  type CurrentUser,
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
    const [memberList, invitationList, socialAccountList] = await Promise.all([
      apiRequest<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`, { token: storedToken }),
      canManageMembers
        ? apiRequest<WorkspaceInvitation[]>(`/workspaces/${workspaceId}/invitations`, {
            token: storedToken
          })
        : Promise.resolve([]),
      apiRequest<SocialAccount[]>(`/workspaces/${workspaceId}/social-accounts`, {
        token: storedToken
      })
    ]);

    setMembers(memberList);
    setInvitations(invitationList);
    setSocialAccounts(socialAccountList);
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
    return date.toISOString().slice(0, 16);
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
          timezone: String(formData.get("timezone") ?? "UTC")
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

  async function connectSocialAccount(platform: "twitter" | "facebook" | "instagram") {
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
    const scheduledAt = new Date(scheduledAtLocal).toISOString();

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
              <input name="timezone" type="hidden" value="UTC" />
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

          <section className="panel">
            <div className="row">
              <h2>社交账号</h2>
              <span className="muted">{socialAccounts.length}</span>
            </div>

            {canManageMembers ? (
              <div className="form">
                <button className="button" type="button" onClick={() => connectSocialAccount("twitter")}>
                  绑定 X / Twitter
                </button>
                <button className="button secondary" type="button" onClick={() => connectSocialAccount("facebook")}>
                  绑定 Facebook
                </button>
                <button className="button secondary" type="button" onClick={() => connectSocialAccount("instagram")}>
                  绑定 Instagram
                </button>
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
