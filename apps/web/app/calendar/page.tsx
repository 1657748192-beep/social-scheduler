"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { ContentCalendar } from "../../components/calendar/ContentCalendar";
import { apiRequest, type Workspace } from "../../lib/api";

export default function CalendarPage() {
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
        setError(requestError instanceof Error ? requestError.message : "Could not load workspaces");
      });
  }, [router]);

  return (
    <AppShell title="Content Calendar" subtitle="Scheduled content" wide>
      {error ? <p className="error">{error}</p> : null}
      {token && workspaces.length ? <ContentCalendar token={token} workspaces={workspaces} /> : null}
      {token && !workspaces.length ? (
        <section className="panel">
          <h1>No workspaces</h1>
          <p className="muted">Create a workspace before using the calendar.</p>
        </section>
      ) : null}
    </AppShell>
  );
}
