import { Router } from "express";
import {
  getInstagramPostMetricsController,
  getInstagramReceptionController,
  listInstagramPostCommentsController,
  listInstagramConversationsController,
  listInstagramMessagesController,
  replyToInstagramConversationController,
  replyToInstagramPostCommentController,
  sendInstagramPrivateReplyController,
  recoverLegacyInstagramPostAccountController
} from "../controllers/instagramEngagementController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const instagramEngagementRoutes = Router();
instagramEngagementRoutes.get("/workspaces/:workspaceId/social-accounts/:socialAccountId/instagram/reception", requireAuth, asyncHandler(getInstagramReceptionController));

instagramEngagementRoutes.get(
  "/workspaces/:workspaceId/instagram/posts/:scheduleId/metrics",
  requireAuth,
  asyncHandler(getInstagramPostMetricsController)
);
instagramEngagementRoutes.post(
  "/workspaces/:workspaceId/instagram/posts/:scheduleId/recover-account",
  requireAuth,
  asyncHandler(recoverLegacyInstagramPostAccountController)
);
instagramEngagementRoutes.get(
  "/workspaces/:workspaceId/instagram/posts/:scheduleId/comments",
  requireAuth,
  asyncHandler(listInstagramPostCommentsController)
);
instagramEngagementRoutes.post(
  "/workspaces/:workspaceId/instagram/posts/:scheduleId/comments/replies",
  requireAuth,
  asyncHandler(replyToInstagramPostCommentController)
);
instagramEngagementRoutes.post(
  "/workspaces/:workspaceId/instagram/posts/:scheduleId/comments/private-replies",
  requireAuth,
  asyncHandler(sendInstagramPrivateReplyController)
);
instagramEngagementRoutes.get(
  "/workspaces/:workspaceId/social-accounts/:socialAccountId/instagram/conversations",
  requireAuth,
  asyncHandler(listInstagramConversationsController)
);
instagramEngagementRoutes.get(
  "/workspaces/:workspaceId/social-accounts/:socialAccountId/instagram/conversations/:conversationId/messages",
  requireAuth,
  asyncHandler(listInstagramMessagesController)
);
instagramEngagementRoutes.post(
  "/workspaces/:workspaceId/social-accounts/:socialAccountId/instagram/conversations/:conversationId/replies",
  requireAuth,
  asyncHandler(replyToInstagramConversationController)
);
