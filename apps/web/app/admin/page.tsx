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

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const storedToken = localStorage.getItem("social_scheduler_token");

    if (!storedToken) {
      router.replace("/login");
      return;
    }

    setToken(storedToken);
    apiRequest<AdminUsersResponse>("/admin/users", { token: storedToken })
      .then(setData)
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "无法加载管理员数据"
        );
      });
  }, [router]);

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

          <section className="admin-user-list">
            {filteredUsers.map((user) => (
              <article className="admin-user-card" key={user.id}>
                <header>
                  <div>
                    <h3>{user.name}</h3>
                    <p>{user.email}</p>
                  </div>
                  <span className="status-pill ready">账号正常</span>
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
