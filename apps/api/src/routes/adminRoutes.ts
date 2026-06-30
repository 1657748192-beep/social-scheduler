import { Router } from "express";
import { listAdminUsersController } from "../controllers/adminController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const adminRoutes = Router();

adminRoutes.get("/admin/users", requireAuth, asyncHandler(listAdminUsersController));
