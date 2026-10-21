"use client";

import { AppShell } from "../../components/AppShell";
import { ContentCalendar } from "../../components/calendar/ContentCalendar";
import {usePublishingWorkspaces} from '../../lib/usePublishingWorkspaces';
import {WorkspaceLoadNotice} from '../../components/WorkspaceLoadNotice';
import { useLanguage } from "../../components/LanguageProvider";

export default function CalendarPage() {
  const { t } = useLanguage();
  const {token,workspaces,status}=usePublishingWorkspaces();

  return (
    <AppShell title={t("排程日历", "Content calendar")} subtitle={t("按周/月查看已安排内容，支持拖拽调整时间", "View scheduled content by week or month and adjust its time")} wide>
      <WorkspaceLoadNotice status={status} empty={!workspaces.length}/>
      {status==='ready' && token && workspaces.length ? <ContentCalendar token={token} workspaces={workspaces} /> : null}
    </AppShell>
  );
}
