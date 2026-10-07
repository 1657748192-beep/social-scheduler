import { apiRequest, type DashboardOverview } from "./api";

export function startDashboardOverviewRequest(token: string, workspaceId: string, receive: (data: DashboardOverview | null) => void) {
  let canceled = false;
  apiRequest<DashboardOverview>(`/workspaces/${encodeURIComponent(workspaceId)}/dashboard-overview`, { token })
    .then(data => { if (!canceled) receive(data); })
    .catch(() => { if (!canceled) receive(null); });
  return () => { canceled = true; };
}
