import type { Workspace } from "./api";

const activeWorkspaceStorageKey = "social_scheduler_active_workspace_id";
const activeWorkspaceChangeEvent = "social_scheduler_active_workspace_change";

export function getActiveWorkspaceId(workspaces: Workspace[], preferredWorkspaceId?: string | null) {
  if (preferredWorkspaceId && workspaces.some((workspace) => workspace.id === preferredWorkspaceId)) {
    return preferredWorkspaceId;
  }

  if (typeof window !== "undefined") {
    const storedWorkspaceId = window.localStorage.getItem(activeWorkspaceStorageKey);

    if (storedWorkspaceId && workspaces.some((workspace) => workspace.id === storedWorkspaceId)) {
      return storedWorkspaceId;
    }
  }

  return workspaces[0]?.id ?? "";
}

export function setActiveWorkspaceId(workspaceId: string) {
  if (typeof window === "undefined" || !workspaceId) {
    return;
  }

  window.localStorage.setItem(activeWorkspaceStorageKey, workspaceId);
  window.dispatchEvent(new Event(activeWorkspaceChangeEvent));
}

export function getActiveWorkspaceChangeEvent() {
  return activeWorkspaceChangeEvent;
}
