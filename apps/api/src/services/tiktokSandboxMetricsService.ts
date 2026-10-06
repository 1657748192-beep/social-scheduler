import { HttpError } from "../utils/errors";
import { assertSandboxContext, type SandboxDependencies } from "./tiktokSandboxAuthorizationService";
import { createSandboxCredentialService } from "../integrations/social/tiktokSandboxCredentialService";
import { queryTikTokAccountStats } from "../integrations/social/tiktokAccountStats";
import { queryTikTokPostMetrics } from "../integrations/social/tiktokPostMetrics";

type Post = { workspaceId: string; status: string; postVariant: { platform: string; socialAccountId: string | null }; publishJobs: { status: string; providerPostId: string | null; rawResponse: unknown }[] };
export function sandboxVideoId(post: Post | null, workspaceId: string, accountId: string, productionOpenId: string): string {
  const job = post?.publishJobs[0];
  const raw = job?.rawResponse;
  const details = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (!post || post.workspaceId !== workspaceId || post.status !== "published" || post.postVariant.platform !== "tiktok" ||
      post.postVariant.socialAccountId !== accountId || job?.status !== "succeeded" || details.simulated === true ||
      (details.tiktokAccountId !== undefined && details.tiktokAccountId !== productionOpenId)) throw new HttpError(404, "Published TikTok post is unavailable");
  if (details.privacyLevel && details.privacyLevel !== "PUBLIC_TO_EVERYONE") throw new HttpError(400, "Only public videos have test metrics");
  if (!job.providerPostId || !/^\d{10,30}$/.test(job.providerPostId)) throw new HttpError(400, "Public TikTok video ID is unavailable");
  return job.providerPostId;
}
export function createSandboxMetricsService(deps: SandboxDependencies, fetcher: typeof fetch = fetch) {
  const credentials = createSandboxCredentialService(deps);
  const { db, settings } = deps;
  const include = { postVariant: true, publishJobs: { where: { status: "succeeded" as const }, orderBy: { updatedAt: "desc" as const }, take: 1 } };
  return {
    async stats(userId: string, workspaceId: string) {
      const token = await credentials.token(userId, workspaceId);
      const result = await queryTikTokAccountStats(token.accessToken, token.openId, fetcher);
      return result.status === "ok" ? { ...result, fetchedAt: new Date().toISOString() } : result;
    },
    async metrics(userId: string, workspaceId: string, scheduleId: string) {
      if (!/^[0-9a-f-]{36}$/i.test(scheduleId)) throw new HttpError(400, "Invalid post ID");
      const account = await db.$transaction(tx => assertSandboxContext(tx, settings, userId, workspaceId));
      const post = await db.schedule.findFirst({ where: { id: scheduleId, workspaceId }, include });
      const videoId = sandboxVideoId(post, workspaceId, account.id, account.providerAccountId);
      const token = await credentials.token(userId, workspaceId);
      const result = await queryTikTokPostMetrics(token.accessToken, videoId, fetcher);
      return result.status === "ok" ? { ...result, fetchedAt: new Date().toISOString() } : result;
    },
    async posts(userId: string, workspaceId: string, cursor?: string) {
      const account = await db.$transaction(tx => assertSandboxContext(tx, settings, userId, workspaceId));
      if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) throw new HttpError(400, "Invalid cursor");
      const rows = await db.schedule.findMany({ where: { workspaceId, status: "published", ...(cursor ? { id: { gt: cursor } } : {}),
        postVariant: { platform: "tiktok", socialAccountId: account.id } }, include, orderBy: { id: "asc" }, take: 21 });
      const page = rows.slice(0, 20);
      const items = page.flatMap(post => {
        try { const videoId = sandboxVideoId(post, workspaceId, account.id, account.providerAccountId);
          return [{ id: post.id, videoId, text: post.postVariant.text.slice(0, 160) }];
        } catch { return []; }
      });
      return { items, nextCursor: rows.length > 20 ? page[page.length - 1].id : null };
    }
  };
}
