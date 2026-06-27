import { Router } from "express";
import {
  acceptInvitationController,
  createInvitationController,
  createWorkspaceController,
  getInvitationController,
  getWorkspaceController,
  listInvitationsController,
  listMembersController,
  listWorkspacesController,
  revokeInvitationController,
  updateMemberController
} from "../controllers/workspaceController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const workspaceRoutes = Router();

workspaceRoutes.get("/workspaces", requireAuth, asyncHandler(listWorkspacesController));
workspaceRoutes.post("/workspaces", requireAuth, asyncHandler(createWorkspaceController));
workspaceRoutes.get("/workspaces/:workspaceId", requireAuth, asyncHandler(getWorkspaceController));

workspaceRoutes.get(
  "/workspaces/:workspaceId/members",
  requireAuth,
  asyncHandler(listMembersController)
);
workspaceRoutes.patch(
  "/workspaces/:workspaceId/members/:memberId",
  requireAuth,
  asyncHandler(updateMemberController)
);

workspaceRoutes.get(
  "/workspaces/:workspaceId/invitations",
  requireAuth,
  asyncHandler(listInvitationsController)
);
workspaceRoutes.post(
  "/workspaces/:workspaceId/invitations",
  requireAuth,
  asyncHandler(createInvitationController)
);
workspaceRoutes.delete(
  "/workspaces/:workspaceId/invitations/:invitationId",
  requireAuth,
  asyncHandler(revokeInvitationController)
);

workspaceRoutes.get("/invitations/:token", asyncHandler(getInvitationController));
workspaceRoutes.post(
  "/invitations/:token/accept",
  requireAuth,
  asyncHandler(acceptInvitationController)
);
