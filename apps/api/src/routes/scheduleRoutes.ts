import { Router } from "express";
import {
  cancelScheduleController,
  createDemoScheduleController,
  createScheduleController,
  getScheduleController,
  listSchedulesController,
  publishNowController,
  rescheduleScheduleController,
  retryPublishJobController
} from "../controllers/scheduleController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const scheduleRoutes = Router();

scheduleRoutes.post("/schedules/demo", requireAuth, asyncHandler(createDemoScheduleController));
scheduleRoutes.get(
  "/workspaces/:workspaceId/schedules",
  requireAuth,
  asyncHandler(listSchedulesController)
);
scheduleRoutes.post(
  "/workspaces/:workspaceId/schedules",
  requireAuth,
  asyncHandler(createScheduleController)
);
scheduleRoutes.get(
  "/workspaces/:workspaceId/schedules/:scheduleId",
  requireAuth,
  asyncHandler(getScheduleController)
);
scheduleRoutes.patch(
  "/workspaces/:workspaceId/schedules/:scheduleId",
  requireAuth,
  asyncHandler(rescheduleScheduleController)
);
scheduleRoutes.post(
  "/workspaces/:workspaceId/schedules/:scheduleId/cancel",
  requireAuth,
  asyncHandler(cancelScheduleController)
);
scheduleRoutes.post(
  "/workspaces/:workspaceId/schedules/:scheduleId/publish-now",
  requireAuth,
  asyncHandler(publishNowController)
);
scheduleRoutes.post(
  "/workspaces/:workspaceId/publish-jobs/:publishJobId/retry",
  requireAuth,
  asyncHandler(retryPublishJobController)
);
