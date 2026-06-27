import { Router } from "express";
import {
  createComposerPostController,
  getComposerPlatformsController,
  getComposerPostController,
  listComposerPostsController,
  listWorkspaceMediaController,
  uploadWorkspaceMediaController
} from "../controllers/composerController";
import { requireAuth } from "../middleware/auth";
import { mediaUpload } from "../middleware/upload";
import { asyncHandler } from "../utils/asyncHandler";

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
  mediaUpload.single("file"),
  asyncHandler(uploadWorkspaceMediaController)
);

composerRoutes.get(
  "/workspaces/:workspaceId/composer/posts",
  requireAuth,
  asyncHandler(listComposerPostsController)
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
