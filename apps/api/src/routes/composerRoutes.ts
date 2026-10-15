import { Router } from "express";
import {
  completeCosMediaUploadController,
  createCosMediaUploadIntentController,
  createComposerPostController,
  deleteWorkspaceDraftController,
  getComposerPlatformsController,
  getComposerPostController,
  listComposerPostsController,
  listWorkspaceDraftsController,
  listWorkspaceMediaController,
  uploadWorkspaceMediaController
} from "../controllers/composerController";
import { requireAuth } from "../middleware/auth";
import { mediaUpload } from "../middleware/upload";
import { asyncHandler } from "../utils/asyncHandler";
import { allowMediaUploadTime } from "../httpServer";
import { requireWorkspacePublishingAccess } from "../services/workspaceService";
import { HttpError } from "../utils/errors";

export const composerRoutes = Router();

composerRoutes.get("/composer/platforms", asyncHandler(getComposerPlatformsController));

composerRoutes.get(
  "/workspaces/:workspaceId/media",
  requireAuth,
  asyncHandler(listWorkspaceMediaController)
);
composerRoutes.post(
  "/workspaces/:workspaceId/media",
  requireAuth,
  asyncHandler(async (req, _res, next) => {
    const membership = await requireWorkspacePublishingAccess(req.user!.id, req.params.workspaceId);
    if (membership.role === "viewer") throw new HttpError(403, "Viewers cannot upload media");
    next();
  }),
  allowMediaUploadTime,
  mediaUpload.fields([
    { name: "file", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
  ]),
  asyncHandler(uploadWorkspaceMediaController)
);
composerRoutes.post(
  "/workspaces/:workspaceId/media/cos/intent",
  requireAuth,
  asyncHandler(createCosMediaUploadIntentController)
);
composerRoutes.post(
  "/workspaces/:workspaceId/media/cos/complete",
  requireAuth,
  asyncHandler(completeCosMediaUploadController)
);

composerRoutes.get(
  "/workspaces/:workspaceId/composer/posts",
  requireAuth,
  asyncHandler(listComposerPostsController)
);
composerRoutes.get(
  "/workspaces/:workspaceId/composer/drafts",
  requireAuth,
  asyncHandler(listWorkspaceDraftsController)
);
composerRoutes.delete(
  "/workspaces/:workspaceId/composer/drafts/:postId",
  requireAuth,
  asyncHandler(deleteWorkspaceDraftController)
);
composerRoutes.post(
  "/workspaces/:workspaceId/composer/posts",
  requireAuth,
  asyncHandler(createComposerPostController)
);
composerRoutes.get(
  "/workspaces/:workspaceId/composer/posts/:postId",
  requireAuth,
  asyncHandler(getComposerPostController)
);
