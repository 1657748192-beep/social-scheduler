import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import { uploadRoot } from "./middleware/upload";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRoutes } from "./routes/authRoutes";
import { composerRoutes } from "./routes/composerRoutes";
import { healthRoutes } from "./routes/healthRoutes";
import { scheduleRoutes } from "./routes/scheduleRoutes";
import { socialAccountRoutes } from "./routes/socialAccountRoutes";
import { workspaceRoutes } from "./routes/workspaceRoutes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use("/uploads", express.static(uploadRoot));

  app.use("/api/v1", healthRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1", workspaceRoutes);
  app.use("/api/v1", socialAccountRoutes);
  app.use("/api/v1", composerRoutes);
  app.use("/api/v1", scheduleRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
