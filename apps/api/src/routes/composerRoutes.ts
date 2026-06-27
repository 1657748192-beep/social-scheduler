import { Router } from "express";
import {
  createComposerPostController,
  getComposerPlatformsController,
  getComposerPostController,
  listComposerPostsController,
  listWorkspaceMediaController,
  uploadWorkspaceImageController
} from "../controllers/composerController";
import { requireAuth } from "../middleware/auth";
import { imageUpload } from "../middleware/upload";
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
  imageUpload.single("file"),
  asyncHandler(uploadWorkspaceImageController)
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
