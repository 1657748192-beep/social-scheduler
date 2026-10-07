import { apiRequest, type DashboardOverview } from "./api";

export function startDashboardOverviewRequest(token: string, workspaceId: string, receive: (data: DashboardOverview | null) => void, autoRefresh = false) {
  let canceled = false;
  let pending = false;
  const documentTarget = typeof document !== "undefined" ? document : null;
  const windowTarget = typeof window !== "undefined" ? window : null;
  const refresh = () => {
    if (canceled || pending || (autoRefresh && documentTarget?.visibilityState === "hidden")) return;
    pending = true;
    apiRequest<DashboardOverview>(`/workspaces/${encodeURIComponent(workspaceId)}/dashboard-overview`, { token })
    .then(data => { if (!canceled) receive(data); })
    .catch(() => { if (!canceled) receive(null); })
    .finally(() => { pending = false; });
  };
  refresh();
  const timer = autoRefresh ? setInterval(refresh, 60000) : null;
  if (autoRefresh) {
    windowTarget?.addEventListener("focus", refresh);
    documentTarget?.addEventListener("visibilitychange", refresh);
  }
  return () => {
    canceled = true;
    if (timer !== null) clearInterval(timer);
    if (autoRefresh) {
      windowTarget?.removeEventListener("focus", refresh);
      documentTarget?.removeEventListener("visibilitychange", refresh);
    }
  };
}
