import { Router } from "express";
import {
  disconnectSocialAccountController,
  listSocialAccountsController,
  oauthCallbackController,
  startOAuthController
} from "../controllers/socialAccountController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const socialAccountRoutes = Router();

socialAccountRoutes.get(
  "/integrations/:platform/oauth/start",
  requireAuth,
  asyncHandler(startOAuthController)
);
socialAccountRoutes.get(
  "/integrations/:platform/oauth/callback",
  asyncHandler(oauthCallbackController)
);

socialAccountRoutes.get(
  "/workspaces/:workspaceId/social-accounts",
  requireAuth,
  asyncHandler(listSocialAccountsController)
);
socialAccountRoutes.delete(
  "/workspaces/:workspaceId/social-accounts/:socialAccountId",
  requireAuth,
  asyncHandler(disconnectSocialAccountController)
);
