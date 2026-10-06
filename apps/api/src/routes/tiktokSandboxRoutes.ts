import { Router } from "express";
import { config } from "../config";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { createSandboxAuthorizationService, type SandboxSettings } from "../services/tiktokSandboxAuthorizationService";
import { createTikTokSandboxAPI } from "../integrations/oauth/tiktokSandboxOAuth";

export const sandboxSettings: SandboxSettings = {
  enabled: config.TIKTOK_SANDBOX_ENABLED, allowedUserId: config.TIKTOK_SANDBOX_ALLOWED_USER_ID,
  allowedWorkspaceId: config.TIKTOK_SANDBOX_WORKSPACE_ID, allowedAccountId: config.TIKTOK_SANDBOX_SOCIAL_ACCOUNT_ID,
  clientId: config.TIKTOK_SANDBOX_CLIENT_ID, clientSecret: config.TIKTOK_SANDBOX_CLIENT_SECRET,
  redirectUri: `${config.API_PUBLIC_URL.replace(/\/$/, "")}/api/v1/integrations/tiktok-sandbox/oauth/callback`
};
const dependencies = { db: prisma, settings: sandboxSettings, api: createTikTokSandboxAPI() };
const authorization = createSandboxAuthorizationService(dependencies);
export const tiktokSandboxRoutes = Router();
const base = "/workspaces/:workspaceId/tiktok-sandbox";
tiktokSandboxRoutes.post(`${base}/oauth/start`, requireAuth, asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await authorization.start(req.user!.id, req.params.workspaceId, req.user!.sessionId));
}));
tiktokSandboxRoutes.get("/integrations/tiktok-sandbox/oauth/callback", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
  let result = "failed";
  try {
    await authorization.complete({ state: typeof req.query.state === "string" ? req.query.state : "",
      code: typeof req.query.code === "string" ? req.query.code : undefined,
      error: typeof req.query.error === "string" ? req.query.error : undefined });
    result = "connected";
  } catch { /* Fixed status only; provider diagnostics may contain credentials. */ }
  const target = new URL("/dashboard", config.WEB_APP_URL);
  target.searchParams.set("tiktok_sandbox", result); res.redirect(target.toString());
}));
