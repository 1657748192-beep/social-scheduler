import { Router } from "express";
import {
  confirmPasswordResetController,
  loginController,
  logoutController,
  meController,
  registerController,
  requestPasswordResetController
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const authRoutes = Router();

authRoutes.post("/register", asyncHandler(registerController));
authRoutes.post("/login", asyncHandler(loginController));
authRoutes.post("/password-reset/request", asyncHandler(requestPasswordResetController));
authRoutes.post("/password-reset/confirm", asyncHandler(confirmPasswordResetController));
authRoutes.get("/me", requireAuth, asyncHandler(meController));
authRoutes.post("/logout", requireAuth, asyncHandler(logoutController));
