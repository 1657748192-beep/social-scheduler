import type { Request, Response } from "express";
import { config } from "../config";
import { prisma } from "../prisma";
import { createDashboardOverviewService } from "../services/dashboardOverviewService";
import { requireWorkspaceMembership } from "../services/workspaceService";
import { withResolvedMediaUrl } from "../services/mediaStorageService";

const readOverview = createDashboardOverviewService({
  db: prisma, requireMembership: requireWorkspaceMembership,
  draftRetentionHours: config.DRAFT_RETENTION_HOURS,
  previewUrl: asset => {
    const resolved = withResolvedMediaUrl(asset);
    return resolved.thumbnailUrl || (asset.mimeType.startsWith("image/") && !asset.originalDeletedAt ? resolved.fileUrl : null);
  }
});

export async function dashboardOverviewController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  return res.json(await readOverview(req.user!.id, req.params.workspaceId));
}
