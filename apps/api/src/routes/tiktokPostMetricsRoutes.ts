import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { requireWorkspaceMembership } from "../services/workspaceService";
import { createTikTokPostMetricsService } from "../services/tiktokPostMetricsService";
import { queryTikTokPostMetrics } from "../integrations/social/tiktokPostMetrics";
import { getTikTokAccountAccessToken } from "../integrations/social/tiktokCredentialService";
import { createTikTokAccountStatsService } from "../services/tiktokAccountStatsService";
import { queryTikTokAccountStats } from "../integrations/social/tiktokAccountStats";

const getMetrics = createTikTokPostMetricsService({
  requireMembership: requireWorkspaceMembership,
  findPost: (workspaceId, scheduleId) => prisma.schedule.findFirst({
    where: { id: scheduleId, workspaceId, status: "published", postVariant: { platform: "tiktok" } },
    include: {
      postVariant: { include: { socialAccount: { include: { credential: { select: { scopes: true } } } } } },
      publishJobs: { where: { status: "succeeded" }, orderBy: { updatedAt: "desc" }, take: 1 }
    }
  }),
  // Scope is checked locally by the metrics service; don't pass optional scopes to the publishing status resolver.
  getAccessToken: (accountId) => getTikTokAccountAccessToken(accountId),
  queryMetrics: queryTikTokPostMetrics
});

export const tiktokPostMetricsRoutes = Router();
const getAccountStats = createTikTokAccountStatsService({
  requireMembership: requireWorkspaceMembership,
  findAccount: (workspaceId, accountId) => prisma.socialAccount.findFirst({
    where: { id: accountId, workspaceId, platform: "tiktok" },
    select: { id: true, workspaceId: true, platform: true, providerAccountId: true, status: true, credential: { select: { scopes: true } } }
  }),
  getAccessToken: accountId => getTikTokAccountAccessToken(accountId),
  queryStats: queryTikTokAccountStats
});
tiktokPostMetricsRoutes.get("/workspaces/:workspaceId/social-accounts/:accountId/tiktok-stats", requireAuth, asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getAccountStats(req.user!.id, req.params.workspaceId, req.params.accountId));
}));
tiktokPostMetricsRoutes.get("/workspaces/:workspaceId/tiktok/posts/:scheduleId/metrics", requireAuth, asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getMetrics(req.user!.id, req.params.workspaceId, req.params.scheduleId));
}));
