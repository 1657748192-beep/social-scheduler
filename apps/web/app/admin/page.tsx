"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { apiRequest, type AdminUser, type AdminUsersResponse } from "../../lib/api";
import { memberStatusLabel, platformLabel, roleLabel } from "../../lib/labels";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function formatDate(value?: string | null) {
  if (!value) {
    return "无记录";
  }

  return dateFormatter.format(new Date(value));
}

function sessionStatus(user: AdminUser) {
  if (user.sessionSummary.activeSessions > 0) {
    return `有效，最近到期 ${formatDate(user.sessionSummary.latestSessionExpiresAt)}`;
  }

  if (user.sessionSummary.latestSessionExpiresAt) {
    return `无有效登录，最近到期 ${formatDate(user.sessionSummary.latestSessionExpiresAt)}`;
  }

  return "还没有登录会话";
}

function dateTimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const parts = dateFormatter.formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function accessStatusLabel(accessStatus: "active" | "disabled" | "expired") {
  if (accessStatus === "expired") {
    return "测试已到期";
  }

  if (accessStatus === "disabled") {
    return "已停用";
  }

  return "使用中";
}

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  async function loadAdminUsers(authToken: string) {
    const result = await apiRequest<AdminUsersResponse>("/admin/users", { token: authToken });
    setData(result);
  }

  useEffect(() => {
    const storedToken = localStorage.getItem("social_scheduler_token");

    if (!storedToken) {
      router.replace("/login");
      return;
    }

    setToken(storedToken);
    loadAdminUsers(storedToken)
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "无法加载管理员数据"
        );
      });
  }, [router]);

  async function updatePublishingAccess(
    userId: string,
    body: { publishingAccessDisabled?: boolean; publishingAccessExpiresAt?: string | null },
    successMessage: string
  ) {
    if (!token) {
      return;
    }

    setActionMessage(null);
    setUpdatingUserId(userId);

    try {
      await apiRequest(`/admin/users/${userId}/publishing-access`, {
        token,
        method: "PATCH",
        body
      });
      await loadAdminUsers(token);
      setActionMessage(successMessage);
    } catch (requestError) {
      setActionMessage(requestError instanceof Error ? requestError.message : "保存失败，请重试。");
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function saveExpiry(event: React.FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = String(form.get("expiresAt") ?? "").trim();

    await updatePublishingAccess(
      userId,
      { publishingAccessExpiresAt: value ? new Date(value).toISOString() : null },
      value ? "测试截止时间已保存。" : "已取消测试截止时间。"
    );
  }

  async function deleteUser(user: AdminUser) {
    if (
      !window.confirm(
        `确定永久删除 ${user.email} 吗？\n\n该用户的登录、个人工作区、帖子、排程、素材和已绑定的发布任务都会被删除，无法恢复。`
      )
    ) {
      return;
    }

    if (!token) {
      return;
    }

    setActionMessage(null);
    setDeletingUserId(user.id);

    try {
      await apiRequest(`/admin/users/${user.id}`, {
        token,
        method: "DELETE"
      });
      await loadAdminUsers(token);
      setActionMessage(`已永久删除账号 ${user.email}。`);
    } catch (requestError) {
      setActionMessage(requestError instanceof Error ? requestError.message : "删除失败，请重试。");
    } finally {
      setDeletingUserId(null);
    }
  }

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) {
      return data?.users ?? [];
    }

    return (data?.users ?? []).filter((user) =>
      [user.email, user.name, ...user.workspaces.map((workspace) => workspace.name)]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [data?.users, query]);

  const totals = useMemo(() => {
    const users = data?.users ?? [];
    const workspaceIds = new Set<string>();
    let socialAccounts = 0;
    let activeSessions = 0;

    for (const user of users) {
      activeSessions += user.sessionSummary.activeSessions;
      for (const workspace of user.workspaces) {
        workspaceIds.add(workspace.id);
        socialAccounts += workspace.socialAccounts.length;
      }
    }

    return {
      users: users.length,
      workspaces: workspaceIds.size,
      socialAccounts,
      activeSessions
    };
  }, [data?.users]);

  return (
    <AppShell title="管理员" subtitle="查看注册用户、登录有效期、工作区和绑定渠道" wide>
      {error ? (
        <section className="panel admin-denied">
          <h2>无法访问管理员界面</h2>
          <p>{error}</p>
          <p className="muted">
            只有服务器环境变量 ADMIN_EMAILS 里配置的邮箱可以打开这里。
          </p>
        </section>
      ) : null}

      {!error && token ? (
        <div className="admin-layout">
          <section className="admin-metrics">
            <article>
              <span>注册用户</span>
              <strong>{totals.users}</strong>
            </article>
            <article>
              <span>工作区</span>
              <strong>{totals.workspaces}</strong>
            </article>
            <article>
              <span>绑定账号</span>
              <strong>{totals.socialAccounts}</strong>
            </article>
            <article>
              <span>有效登录</span>
              <strong>{totals.activeSessions}</strong>
            </article>
          </section>

          <section className="panel admin-toolbar">
            <div>
              <h2>用户列表</h2>
              <p className="muted">
                密码不会明文显示。系统只保存加密哈希，后续如需处理密码应做重置密码功能。
              </p>
            </div>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索邮箱、姓名或工作区"
              type="search"
              value={query}
            />
          </section>

          {actionMessage ? <p className="admin-action-message">{actionMessage}</p> : null}

          <section className="admin-user-list">
            {filteredUsers.map((user) => (
              <article className="admin-user-card" key={user.id}>
                <header>
                  <div>
                    <h3>{user.name}</h3>
                    <p>{user.email}</p>
                  </div>
                  <span
                    className={`status-pill ${
                      user.publishingAccessStatus === "active" ? "ready" : "warning"
                    }`}
                  >
                    发布权限：{accessStatusLabel(user.publishingAccessStatus)}
                  </span>
                </header>

                <dl className="admin-user-facts">
                  <div>
                    <dt>注册时间</dt>
                    <dd>{formatDate(user.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>登录有效期</dt>
                    <dd>{sessionStatus(user)}</dd>
                  </div>
                  <div>
                    <dt>密码</dt>
                    <dd>不可查看，已加密保存</dd>
                  </div>
                  <div>
                    <dt>内容/素材</dt>
                    <dd>
                      {user.stats.authoredPosts} 条内容 / {user.stats.uploadedMedia} 个素材
                    </dd>
                  </div>
                </dl>

                {user.isSystemAdmin ? (
                  <p className="muted admin-system-account-note">系统管理员账号受保护，不能在这里停用或删除。</p>
                ) : (
                <section className="admin-tester-access">
                  <div>
                    <strong>测试人员发布权限</strong>
                    <p className="muted">
                      {user.publishingAccessExpiresAt
                        ? `当前截止：${formatDate(user.publishingAccessExpiresAt)}（北京时间）`
                        : "未设置截止时间，可长期发布。"}
                    </p>
                  </div>

                  <form className="admin-expiry-form" onSubmit={(event) => saveExpiry(event, user.id)}>
                    <label>
                      <span>测试截止时间（北京时间）</span>
                      <input
                        defaultValue={dateTimeLocalValue(user.publishingAccessExpiresAt)}
                        name="expiresAt"
                        type="datetime-local"
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={updatingUserId === user.id || deletingUserId === user.id}
                      type="submit"
                    >
                      保存时间
                    </button>
                  </form>

                  <div className="admin-access-actions">
                    {user.publishingAccessStatus === "active" ? (
                      <button
                        className="button danger"
                        disabled={updatingUserId === user.id || deletingUserId === user.id}
                        onClick={() => {
                          if (window.confirm(`确定停用 ${user.email} 的发帖和排程权限吗？`)) {
                            void updatePublishingAccess(
                              user.id,
                              { publishingAccessDisabled: true },
                              "该测试人员已停用发布权限，仍可登录查看后台。"
                            );
                          }
                        }}
                        type="button"
                      >
                        立即停用发布
                      </button>
                    ) : user.publishingAccessStatus === "expired" ? (
                      <button
                        className="button"
                        disabled={updatingUserId === user.id || deletingUserId === user.id}
                        onClick={() =>
                          void updatePublishingAccess(
                            user.id,
                            { publishingAccessDisabled: false, publishingAccessExpiresAt: null },
                            "该测试人员已恢复发布权限，截止时间已取消。"
                          )
                        }
                        type="button"
                      >
                        恢复并取消到期
                      </button>
                    ) : (
                      <button
                        className="button"
                        disabled={updatingUserId === user.id || deletingUserId === user.id}
                        onClick={() =>
                          void updatePublishingAccess(
                            user.id,
                            { publishingAccessDisabled: false },
                            "该测试人员已恢复发布权限。"
                          )
                        }
                        type="button"
                      >
                        恢复发布
                      </button>
                    )}
                    <button
                      className="button danger-button"
                      disabled={updatingUserId === user.id || deletingUserId === user.id}
                      onClick={() => void deleteUser(user)}
                      type="button"
                    >
                      {deletingUserId === user.id ? "正在删除…" : "删除账号"}
                    </button>
                  </div>
                </section>
                )}

                <div className="admin-workspace-list">
                  {user.workspaces.map((workspace) => (
                    <section className="admin-workspace" key={workspace.id}>
                      <div className="row">
                        <strong>{workspace.name}</strong>
                        <span>
                          {roleLabel(workspace.role)} · {memberStatusLabel(workspace.status)}
                        </span>
                      </div>
                      <p className="muted">
                        {workspace.postCount} 条内容 · {workspace.memberCount} 名成员 ·{" "}
                        {workspace.socialAccountCount} 个绑定账号
                      </p>
                      <div className="admin-channel-chips">
                        {workspace.socialAccounts.length ? (
                          workspace.socialAccounts.map((account) => (
                            <span key={account.id}>
                              {platformLabel(account.platform)} · {account.displayName} ·{" "}
                              {account.status}
                            </span>
                          ))
                        ) : (
                          <em>暂无绑定渠道</em>
                        )}
                      </div>

                    </section>
                  ))}
                </div>
              </article>
            ))}

            {data && !filteredUsers.length ? (
              <section className="panel">
                <p className="muted">没有匹配的用户。</p>
              </section>
            ) : null}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
