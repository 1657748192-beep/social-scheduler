"use client";

import { AppShell } from "../../components/AppShell";
import { PublishedPostManager } from "../../components/posts/PublishedPostManager";
import {usePublishingWorkspaces} from '../../lib/usePublishingWorkspaces';
import {WorkspaceLoadNotice} from '../../components/WorkspaceLoadNotice';
import { useLanguage } from "../../components/LanguageProvider";

export default function PostsPage() {
  const { t } = useLanguage();
  const {token,workspaces,status}=usePublishingWorkspaces();

  return (
    <AppShell title={t("帖子管理", "Post manager")} subtitle={t("查看已发布内容，一键复制后微调并再次发布", "Review published content, copy it, edit it, and publish again")} wide>
      <WorkspaceLoadNotice status={status} empty={!workspaces.length}/>
      {status==='ready' && token && workspaces.length ? <PublishedPostManager token={token} workspaces={workspaces} /> : null}
    </AppShell>
  );
}
