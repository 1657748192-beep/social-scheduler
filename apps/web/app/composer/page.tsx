"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import {usePublishingWorkspaces} from '../../lib/usePublishingWorkspaces';
import {WorkspaceLoadNotice} from '../../components/WorkspaceLoadNotice';
import { ComposerForm } from "../../components/composer/ComposerForm";
import { useLanguage } from "../../components/LanguageProvider";

export default function ComposerPage() {
  const { t } = useLanguage();
  const {token,workspaces,status}=usePublishingWorkspaces();
  const [copyPostId, setCopyPostId] = useState<string | null>(null);
  const [draftPostId, setDraftPostId] = useState<string | null>(null);
  const [initialWorkspaceId, setInitialWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextDraftPostId = params.get("draftPostId");
    setCopyPostId(params.get("copyPostId") ?? nextDraftPostId);
    setDraftPostId(nextDraftPostId);
    setInitialWorkspaceId(params.get("workspaceId"));

  }, []);

  return (
    <AppShell title={t("内容编辑", "Content editor")} subtitle={t("草稿、多平台版本、图片/视频素材与定时发布", "Drafts, platform versions, media, and scheduling")} wide>
      <WorkspaceLoadNotice status={status} empty={!workspaces.length}/>
      {status==='ready' && token && workspaces.length ? (
        <ComposerForm
          copyPostId={copyPostId}
          draftPostId={draftPostId}
          initialWorkspaceId={initialWorkspaceId}
          token={token}
          workspaces={workspaces}
        />
      ) : null}
    </AppShell>
  );
}
