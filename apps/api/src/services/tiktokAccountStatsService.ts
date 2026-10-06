import type { TikTokAccountStatsResult } from "../integrations/social/tiktokAccountStats";
import { HttpError } from "../utils/errors";

type Account = {
  id: string; workspaceId: string; platform: string; providerAccountId: string; status: string;
  credential: { scopes: string[] } | null;
};
type Dependencies = {
  requireMembership(userId: string, workspaceId: string): Promise<unknown>;
  findAccount(workspaceId: string, accountId: string): Promise<Account | null>;
  getAccessToken(accountId: string): Promise<string>;
  queryStats(token: string, providerAccountId: string): Promise<TikTokAccountStatsResult>;
  now?: () => Date;
};

export function createTikTokAccountStatsService(deps: Dependencies) {
  return async (userId: string, workspaceId: string, accountId: string): Promise<TikTokAccountStatsResult> => {
    await deps.requireMembership(userId, workspaceId);
    const account = await deps.findAccount(workspaceId, accountId);
    if (!account || account.id !== accountId || account.workspaceId !== workspaceId || account.platform !== "tiktok") throw new HttpError(404, "TikTok account not found");
    if (!account.credential || !["active", "token_expired"].includes(account.status)) return { status: "account_unavailable" };
    // Statistics are optional; missing scopes must not invalidate the publishing connection.
    if (!account.credential.scopes.includes("user.info.stats")) return { status: "permission_missing" };
    let token: string;
    try { token = await deps.getAccessToken(account.id); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      return { status: /authorization is (invalid|unavailable)|renewal credential expired/i.test(message) ? "authorization_required" : "temporarily_unavailable" };
    }
    const result = await deps.queryStats(token, account.providerAccountId);
    return result.status === "ok" ? { ...result, fetchedAt: (deps.now?.() ?? new Date()).toISOString() } : result;
  };
}
