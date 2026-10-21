"use client";

import { AppShell } from "../../components/AppShell";
import { DraftManager } from "../../components/drafts/DraftManager";
import {usePublishingWorkspaces} from '../../lib/usePublishingWorkspaces';
import {WorkspaceLoadNotice} from '../../components/WorkspaceLoadNotice';
import { useLanguage } from "../../components/LanguageProvider";

export default function DraftsPage() {
  const { t } = useLanguage();
  const {token,workspaces,status}=usePublishingWorkspaces();

  return (
    <AppShell title={t("草稿箱", "Drafts")} subtitle={t("查看、继续编辑或删除 72 小时内保存的草稿", "View, continue editing, or delete drafts saved within 72 hours")} wide>
      <WorkspaceLoadNotice status={status} empty={!workspaces.length}/>
      {status==='ready' && token && workspaces.length ? <DraftManager token={token} workspaces={workspaces} /> : null}
    </AppShell>
  );
}
