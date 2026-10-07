import type { PrismaClient, MediaAsset } from "@prisma/client";

type Dependencies = {
  db: Pick<PrismaClient, "schedule" | "post" | "socialAccount">;
  requireMembership: (userId: string, workspaceId: string) => Promise<unknown>;
  previewUrl: (asset: MediaAsset) => string | null;
  draftRetentionHours: number;
  now?: () => Date;
};

export function createDashboardOverviewService(dependencies: Dependencies) {
  return async (userId: string, workspaceId: string) => {
    await dependencies.requireMembership(userId, workspaceId);
    const now = dependencies.now?.() ?? new Date();
    const pendingWhere = { workspaceId, status: { in: ["scheduled", "locked"] as ("scheduled" | "locked")[] } };
    const [publishedCount, pendingCount, draftCount, connectedCount, schedules] = await Promise.all([
      dependencies.db.schedule.count({ where: { workspaceId, status: "published" } }),
      dependencies.db.schedule.count({ where: pendingWhere }),
      dependencies.db.post.count({ where: { workspaceId, authorId: userId, workflowStatus: "draft", updatedAt: { gte: new Date(now.getTime() - dependencies.draftRetentionHours * 3600000) } } }),
      dependencies.db.socialAccount.count({ where: { workspaceId, status: "active", platform: { in: ["instagram", "facebook", "tiktok", "youtube", "pinterest"] } } }),
      dependencies.db.schedule.findMany({
        where: pendingWhere, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 5,
        select: { id: true, scheduledAt: true, status: true, postVariant: { select: {
          platform: true, text: true, post: { select: { title: true } },
          socialAccount: { select: { displayName: true } },
          media: { orderBy: { sortOrder: "asc" }, take: 1, include: { mediaAsset: true } }
        } } }
      })
    ]);
    return { publishedCount, pendingCount, draftCount, connectedCount, fetchedAt: now.toISOString(), upcoming: schedules.map(schedule => ({
      id: schedule.id, scheduledAt: schedule.scheduledAt.toISOString(), status: schedule.status,
      platform: schedule.postVariant.platform, title: schedule.postVariant.post.title,
      text: schedule.postVariant.text, accountName: schedule.postVariant.socialAccount?.displayName ?? null,
      thumbnailUrl: schedule.postVariant.media[0] ? dependencies.previewUrl(schedule.postVariant.media[0].mediaAsset) : null
    })) };
  };
}
