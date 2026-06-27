import type { Request, Response } from "express";
import { config } from "../config";
import {
  listOAuthProviderStatuses
} from "../integrations/oauth/oauthProviders";
import {
  completeOAuth,
  disconnectSocialAccount,
  listSocialAccounts,
  startOAuth,
  startOAuthSchema
} from "../services/socialAccountService";
import { HttpError } from "../utils/errors";

export async function startOAuthController(req: Request, res: Response) {
  const query = startOAuthSchema.parse(req.query);
  const result = await startOAuth(req.user!.id, req.params.platform, query.workspaceId);
  return res.json(result);
}

export async function oauthProviderStatusController(_req: Request, res: Response) {
  return res.json(listOAuthProviderStatuses());
}

export async function oauthCallbackController(req: Request, res: Response) {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const error = typeof req.query.error === "string" ? req.query.error : undefined;

  if (error) {
    return res.redirect(`${config.WEB_APP_URL}/dashboard?oauth=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    throw new HttpError(400, "Missing OAuth code or state");
  }

  const account = await completeOAuth(req.params.platform, code, state);
  return res.redirect(
    `${config.WEB_APP_URL}/dashboard?oauth=connected&platform=${account.platform}`
  );
}

export async function listSocialAccountsController(req: Request, res: Response) {
  const accounts = await listSocialAccounts(req.user!.id, req.params.workspaceId);
  return res.json(accounts);
}

export async function disconnectSocialAccountController(req: Request, res: Response) {
  const account = await disconnectSocialAccount(
    req.user!.id,
    req.params.workspaceId,
    req.params.socialAccountId
  );
  return res.json(account);
}
