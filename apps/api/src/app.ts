import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { safeRequestLogUrl } from "./utils/requestLog";
import { tiktokSandboxRoutes } from "./routes/tiktokSandboxRoutes";
import { config } from "./config";
import { uploadRoot } from "./middleware/upload";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { adminRoutes } from "./routes/adminRoutes";
import { authRoutes } from "./routes/authRoutes";
import { composerRoutes } from "./routes/composerRoutes";
import { healthRoutes } from "./routes/healthRoutes";
import { createInstagramWebhookRouter } from "./routes/instagramWebhookRoutes";
import { instagramEngagementRoutes } from "./routes/instagramEngagementRoutes";
import { tiktokPostMetricsRoutes } from "./routes/tiktokPostMetricsRoutes";
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
  app.use(
    "/api/v1/webhooks/instagram",
    createInstagramWebhookRouter({
      verifyToken: config.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
      appSecret: config.INSTAGRAM_CLIENT_SECRET
    })
  );
  app.use(express.json({ limit: "1mb" }));
  morgan.token("safe-url", req => safeRequestLogUrl(req.url ?? ""));
  app.use(morgan(":method :safe-url :status :response-time ms"));
  app.use("/uploads", express.static(uploadRoot));

  app.use("/api/v1", healthRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1", adminRoutes);
  app.use("/api/v1", workspaceRoutes);
  app.use("/api/v1", tiktokSandboxRoutes);
  app.use("/api/v1", socialAccountRoutes);
  app.use("/api/v1", composerRoutes);
  app.use("/api/v1", scheduleRoutes);
  app.use("/api/v1", instagramEngagementRoutes);
  app.use("/api/v1", tiktokPostMetricsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
