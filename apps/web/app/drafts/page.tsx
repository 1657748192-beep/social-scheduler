"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { DraftManager } from "../../components/drafts/DraftManager";
import { apiRequest, type Workspace } from "../../lib/api";
import { useLanguage } from "../../components/LanguageProvider";

export default function DraftsPage() {
  const router = useRouter();
  const { t } = useLanguage();
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
    <AppShell title={t("草稿箱", "Drafts")} subtitle={t("查看、继续编辑或删除 72 小时内保存的草稿", "View, continue editing, or delete drafts saved within 72 hours")} wide>
      {error ? <p className="error">{error}</p> : null}
      {token && workspaces.length ? <DraftManager token={token} workspaces={workspaces} /> : null}
      {token && !workspaces.length ? (
        <section className="panel">
          <h1>暂无工作区</h1>
          <p className="muted">请先在控制台创建工作区，再开始编辑内容。</p>
        </section>
      ) : null}
    </AppShell>
  );
}
