"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { PublishedPostManager } from "../../components/posts/PublishedPostManager";
import { apiRequest, type Workspace } from "../../lib/api";

export default function PostsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("social_scheduler_token");

    if (!storedToken) {
      router.replace("/login");
      return;
    }

    setToken(storedToken);
    apiRequest<Workspace[]>("/workspaces", { token: storedToken })
      .then(setWorkspaces)
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "无法加载工作区");
      });
  }, [router]);

  return (
    <AppShell title="帖子管理" subtitle="查看已发布内容，一键复制后微调并再次发布" wide>
      {error ? <p className="error">{error}</p> : null}
      {token && workspaces.length ? <PublishedPostManager token={token} workspaces={workspaces} /> : null}
      {token && !workspaces.length ? (
        <section className="panel">
          <h1>暂无工作区</h1>
          <p className="muted">请先创建工作区，再查看帖子管理。</p>
        </section>
      ) : null}
    </AppShell>
  );
}
