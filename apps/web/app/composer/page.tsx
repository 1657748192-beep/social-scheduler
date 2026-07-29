"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { apiRequest, type Workspace } from "../../lib/api";
import { ComposerForm } from "../../components/composer/ComposerForm";
import { useLanguage } from "../../components/LanguageProvider";

export default function ComposerPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyPostId, setCopyPostId] = useState<string | null>(null);
  const [draftPostId, setDraftPostId] = useState<string | null>(null);
  const [initialWorkspaceId, setInitialWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextDraftPostId = params.get("draftPostId");
    setCopyPostId(params.get("copyPostId") ?? nextDraftPostId);
    setDraftPostId(nextDraftPostId);
    setInitialWorkspaceId(params.get("workspaceId"));

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
    <AppShell title={t("内容编辑", "Content editor")} subtitle={t("草稿、多平台版本、图片/视频素材与定时发布", "Drafts, platform versions, media, and scheduling")} wide>
      {error ? <p className="error">{error}</p> : null}
      {token && workspaces.length ? (
        <ComposerForm
          copyPostId={copyPostId}
          draftPostId={draftPostId}
          initialWorkspaceId={initialWorkspaceId}
          token={token}
          workspaces={workspaces}
        />
      ) : null}
      {token && !workspaces.length ? (
        <section className="panel">
          <h1>暂无工作区</h1>
          <p className="muted">请先在控制台创建工作区，再开始编辑内容。</p>
        </section>
      ) : null}
    </AppShell>
  );
}
