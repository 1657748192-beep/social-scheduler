"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { ContentCalendar } from "../../components/calendar/ContentCalendar";
import { apiRequest, type Workspace } from "../../lib/api";
import { useLanguage } from "../../components/LanguageProvider";

export default function CalendarPage() {
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
    <AppShell title={t("排程日历", "Content calendar")} subtitle={t("按周/月查看已安排内容，支持拖拽调整时间", "View scheduled content by week or month and adjust its time")} wide>
      {error ? <p className="error">{error}</p> : null}
      {token && workspaces.length ? <ContentCalendar token={token} workspaces={workspaces} /> : null}
      {token && !workspaces.length ? (
        <section className="panel">
          <h1>暂无工作区</h1>
          <p className="muted">请先创建工作区，再使用排程日历。</p>
        </section>
      ) : null}
    </AppShell>
  );
}
