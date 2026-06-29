import { Router } from "express";
import {
  createAuthorizationLinkController,
  disconnectSocialAccountController,
  getAuthorizationLinkController,
  listSocialAccountsController,
  oauthCallbackController,
  oauthProviderStatusController,
  startSharedOAuthController,
  startOAuthController
} from "../controllers/socialAccountController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const socialAccountRoutes = Router();

socialAccountRoutes.get(
  "/integrations/oauth/status",
  requireAuth,
  asyncHandler(oauthProviderStatusController)
);
socialAccountRoutes.get(
  "/integrations/oauth/share/:token",
  asyncHandler(getAuthorizationLinkController)
);
socialAccountRoutes.get(
  "/integrations/oauth/share/:token/start",
  asyncHandler(startSharedOAuthController)
);
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
socialAccountRoutes.post(
  "/workspaces/:workspaceId/social-accounts/authorization-links",
  requireAuth,
  asyncHandler(createAuthorizationLinkController)
);
socialAccountRoutes.delete(
  "/workspaces/:workspaceId/social-accounts/:socialAccountId",
  requireAuth,
  asyncHandler(disconnectSocialAccountController)
);
