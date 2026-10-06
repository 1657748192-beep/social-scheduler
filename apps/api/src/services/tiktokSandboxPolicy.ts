import { HttpError } from "../utils/errors";

export type SandboxAccess = {
  enabled: boolean; allowedUserId: string; allowedWorkspaceId: string; allowedAccountId: string;
  clientId: string; clientSecret: string; userId: string; workspaceId: string; accountId: string;
  memberStatus: string; role: string;
};
export function assertTikTokSandboxAccess(input: SandboxAccess): void {
  if (!input.enabled || !input.allowedUserId || !input.allowedWorkspaceId || !input.allowedAccountId ||
      !input.clientId || !input.clientSecret || input.userId !== input.allowedUserId ||
      input.workspaceId !== input.allowedWorkspaceId || input.accountId !== input.allowedAccountId ||
      input.memberStatus !== "active" || !["owner", "admin"].includes(input.role)) {
    throw new HttpError(403, "TikTok sandbox access is unavailable");
  }
}
