import { Router } from "express";
import { healthController } from "../controllers/healthController";
import { asyncHandler } from "../utils/asyncHandler";

export const healthRoutes = Router();

healthRoutes.get("/health", asyncHandler(healthController));
