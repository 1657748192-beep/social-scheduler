import type { Request, Response } from "express";
import { config } from "../config";
import {
  listOAuthProviderStatuses
} from "../integrations/oauth/oauthProviders";
import {
  completeOAuth,
  createAuthorizationLink,
  createAuthorizationLinkSchema,
  disconnectSocialAccount,
  getAuthorizationLink,
  listSocialAccounts,
  startSharedOAuth,
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

  const result = await completeOAuth(req.params.platform, code, state);
  const redirectUrl = result.sharedAuthorization
    ? `${config.WEB_APP_URL}/oauth/share/complete?platform=${result.account.platform}`
    : `${config.WEB_APP_URL}/dashboard?oauth=connected&platform=${result.account.platform}`;

  return res.redirect(redirectUrl);
}

export async function listSocialAccountsController(req: Request, res: Response) {
  const accounts = await listSocialAccounts(req.user!.id, req.params.workspaceId);
  return res.json(accounts);
}

export async function createAuthorizationLinkController(req: Request, res: Response) {
  const body = createAuthorizationLinkSchema.parse(req.body);
  const link = await createAuthorizationLink(req.user!.id, req.params.workspaceId, body);
  return res.status(201).json(link);
}

export async function getAuthorizationLinkController(req: Request, res: Response) {
  const link = await getAuthorizationLink(req.params.token);
  return res.json(link);
}

export async function startSharedOAuthController(req: Request, res: Response) {
  const result = await startSharedOAuth(req.params.token);
  return res.redirect(result.authorizationUrl);
}

export async function disconnectSocialAccountController(req: Request, res: Response) {
  const account = await disconnectSocialAccount(
    req.user!.id,
    req.params.workspaceId,
    req.params.socialAccountId
  );
  return res.json(account);
}
