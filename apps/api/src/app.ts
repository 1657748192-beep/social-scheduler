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
import { instagramEngagementRoutes } from "./routes/instagramEngagementRoutes";
import { tiktokPostMetricsRoutes } from "./routes/tiktokPostMetricsRoutes";
import { scheduleRoutes } from "./routes/scheduleRoutes";
import { socialAccountRoutes } from "./routes/socialAccountRoutes";
import { workspaceRoutes } from "./routes/workspaceRoutes";
import { removedMetaEngagement } from './middleware/removedMetaEngagement';
import { createUploadStatic } from './uploads/local/static';
import { createLocalUploadRouter } from './uploads/local/routes';
import { localUploadRuntime } from './uploads/local/runtime';
import {createFacebookManagementRouter} from './facebookManagement/routes';
import {facebookManagementRuntime,type FacebookManagementRuntime} from './facebookManagement/runtime';
import {createFacebookPageSyncRouter} from './facebookPageSync/routes';
import {getFacebookPageSyncRuntime} from './facebookPageSync/runtime';
import {createInvitationRouter,publicInvitationBodyParser} from './facebookPageImportInvitations/routes';
import {getPageImportRuntime,type PageImportRuntime} from './facebookPageImportInvitations/runtime';
import {createInteractionInboxRuntime} from './interactionInbox/runtime';
import {createInteractionInboxRouter} from './interactionInbox/routes';
import {prisma} from './prisma';
import {redis} from './redis';
import type {InstagramManagementRuntime} from './instagramManagement/runtime';
import {getInstagramManagementRuntime} from './instagramManagement/defaultRuntime';
import {createInstagramManagementRouter} from './instagramManagement/routes';
import {getMetaInboxLifecycleRuntime,type MetaInboxLifecycleRuntime} from './interactionInbox/lifecycleRuntime';
import {getRulesRuntime} from './timezoneRules/runtime';
import {createRulesRouter} from './timezoneRules/routes';

export function createApp(options:{facebookManagement?:FacebookManagementRuntime;instagramManagement?:InstagramManagementRuntime;metaLifecycle?:MetaInboxLifecycleRuntime;pageImport?:PageImportRuntime}={}) {
  const app = express();
  const management=options.facebookManagement??facebookManagementRuntime;
  const instagram=options.instagramManagement??getInstagramManagementRuntime();
  const lifecycle=options.metaLifecycle??getMetaInboxLifecycleRuntime();

  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true
    })
  );
  // Parse only the explicit signed callback form before JSON/morgan. Callback
  // bodies and opaque receipt URLs never enter the ordinary request logger.
  for(const route of lifecycle.routes)app.use(route.prefix,route.router);
  if(management.enabled)app.use('/api/v1/webhooks/facebook',management.webhook);
  if(instagram.receptionEnabled)app.use('/api/v1/webhooks/instagram',instagram.webhook);
  app.use(removedMetaEngagement);
  app.use('/api/v1/facebook-page-import-public',publicInvitationBodyParser());
  app.use(express.json({ limit: "1mb" }));
  morgan.token("safe-url", req => safeRequestLogUrl(req.url ?? ""));
  app.use(morgan(":method :safe-url :status :response-time ms"));
  app.use("/uploads", createUploadStatic(uploadRoot));

  app.use("/api/v1", healthRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use('/api/v1/timezone-rules',createRulesRouter(getRulesRuntime()));
  app.use("/api/v1", adminRoutes);
  app.use("/api/v1", workspaceRoutes);
  app.use('/api/v1',createFacebookManagementRouter(management,{webAppUrl:config.WEB_APP_URL}));
  app.use('/api/v1',createInstagramManagementRouter(instagram,{webAppUrl:config.WEB_APP_URL}));
  app.use('/api/v1',createInteractionInboxRouter(createInteractionInboxRuntime({db:prisma,redis,facebook:management,instagram})));
  app.use("/api/v1", tiktokSandboxRoutes);
  app.use('/api/v1',createInvitationRouter(()=>options.pageImport??getPageImportRuntime(),{webAppUrl:config.WEB_APP_URL}));
  app.use('/api/v1',createFacebookPageSyncRouter(getFacebookPageSyncRuntime,{webAppUrl:config.WEB_APP_URL}));
  app.use("/api/v1", socialAccountRoutes);
  app.use("/api/v1", createLocalUploadRouter(localUploadRuntime));
  app.use("/api/v1", composerRoutes);
  app.use("/api/v1", scheduleRoutes);
  app.use("/api/v1", instagramEngagementRoutes);
  app.use("/api/v1", tiktokPostMetricsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
