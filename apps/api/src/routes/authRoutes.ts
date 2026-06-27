import { Router } from "express";
import {
  loginController,
  logoutController,
  meController,
  registerController
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const authRoutes = Router();

authRoutes.post("/register", asyncHandler(registerController));
authRoutes.post("/login", asyncHandler(loginController));
authRoutes.get("/me", requireAuth, asyncHandler(meController));
authRoutes.post("/logout", requireAuth, asyncHandler(logoutController));
