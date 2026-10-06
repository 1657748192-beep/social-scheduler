import type { TikTokMetricsResult } from "../integrations/social/tiktokPostMetrics";
import { HttpError } from "../utils/errors";

export type TikTokMetricsPost = {
  id: string; workspaceId: string; status: string;
  postVariant: { platform: string; socialAccount: {
    id: string; workspaceId: string; platform: string; providerAccountId: string; status: string;
    credential: { scopes: string[] } | null;
  } | null };
  publishJobs: Array<{ status: string; providerPostId: string | null; rawResponse: unknown }>;
};

type Dependencies = {
  requireMembership(userId: string, workspaceId: string): Promise<unknown>;
  findPost(workspaceId: string, scheduleId: string): Promise<TikTokMetricsPost | null>;
  getAccessToken(accountId: string): Promise<string>;
  queryMetrics(token: string, videoId: string): Promise<TikTokMetricsResult>;
  now?: () => Date;
};

export function createTikTokPostMetricsService(deps: Dependencies) {
  return async (userId: string, workspaceId: string, scheduleId: string): Promise<TikTokMetricsResult> => {
    await deps.requireMembership(userId, workspaceId);
    const post = await deps.findPost(workspaceId, scheduleId);
    const job = post?.publishJobs[0];
    const raw = job?.rawResponse;
    const details = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    if (!post || post.id !== scheduleId || post.workspaceId !== workspaceId || post.status !== "published" ||
        post.postVariant.platform !== "tiktok" || job?.status !== "succeeded" || details.simulated === true) {
      throw new HttpError(404, "Published TikTok post not found");
    }
    const account = post.postVariant.socialAccount;
    if (!account || account.workspaceId !== workspaceId || account.platform !== "tiktok" ||
        !["active", "token_expired"].includes(account.status) || !account.credential ||
        (details.tiktokAccountId !== undefined && details.tiktokAccountId !== account.providerAccountId)) {
      return { status: "account_unavailable" };
    }
    if (details.privacyLevel && details.privacyLevel !== "PUBLIC_TO_EVERYONE") return { status: "private_video" };
    // Publishing can save a publish-task ID when no publicly available video ID exists.
    if (!job.providerPostId || !/^\d{10,30}$/.test(job.providerPostId)) return { status: "video_id_missing" };
    // Optional read permissions must never mark a publishing account permission_missing.
    if (!account.credential.scopes.includes("video.list")) return { status: "permission_missing" };
    let token: string;
    try { token = await deps.getAccessToken(account.id); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      return { status: /authorization is (invalid|unavailable)|renewal credential expired/i.test(message)
        ? "authorization_required" : "temporarily_unavailable" };
    }
    const result = await deps.queryMetrics(token, job.providerPostId);
    return result.status === "ok" ? { ...result, fetchedAt: (deps.now?.() ?? new Date()).toISOString() } : result;
  };
}
