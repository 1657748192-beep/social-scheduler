export type YouTubeRefreshResult =
  | { kind: "success"; accessToken: string; expiresIn: number; refreshToken?: string; refreshExpiresIn?: number }
  | { kind: "authorization_invalid" }
  | { kind: "temporary_failure"; message: string };

export type YouTubeResolution =
  | { kind: "success"; accessToken: string }
  | { kind: "authorization_invalid" }
  | { kind: "permission_missing" }
  | { kind: "token_expired" }
  | { kind: "temporary_failure"; message: string };

export function classifyYouTubeFailure(status: number, reason?: string) {
  if (status === 429 || status >= 500) return "temporary_failure" as const;
  if (reason === "invalid_grant" || reason === "authError" || reason === "invalidCredentials" || status === 401) {
    return "authorization_invalid" as const;
  }
  if (reason === "insufficientPermissions" || reason === "forbiddenForNonOwner") {
    return "permission_missing" as const;
  }
  return "request_failed" as const;
}

export function shouldMarkYouTubeAuthFailure(currentToken: string, usedToken: string) {
  return currentToken === usedToken;
}

export async function refreshYouTubeToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
}): Promise<YouTubeRefreshResult> {
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: input.clientId,
        client_secret: input.clientSecret
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return { kind: "temporary_failure", message: "YouTube token refresh could not reach Google." };
  }
  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
    refresh_token_expires_in?: unknown;
    error?: string;
  } | null;
  if (!response.ok) {
    return classifyYouTubeFailure(response.status, payload?.error) === "authorization_invalid"
      ? { kind: "authorization_invalid" }
      : { kind: "temporary_failure", message: `YouTube token refresh failed (${response.status}).` };
  }
  if (typeof payload?.access_token !== "string" || !payload.access_token ||
      typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
    return { kind: "temporary_failure", message: "YouTube token refresh returned incomplete credentials." };
  }
  return {
    kind: "success",
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    refreshExpiresIn: typeof payload.refresh_token_expires_in === "number"
      ? payload.refresh_token_expires_in : undefined
  };
}

export async function resolveYouTubeAccessToken(input: {
  credential: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    refreshTokenExpiresAt?: Date | null;
    scopes: string[];
  } | null;
  requiredScope?: string;
  now?: number;
  save: (update: { accessToken: string; expiresAt: Date; refreshToken?: string; refreshTokenExpiresAt?: Date | null }) => Promise<void>;
  setStatus: (status: "authorization_invalid" | "permission_missing" | "token_expired") => Promise<void>;
  refresh: (refreshToken: string) => Promise<YouTubeRefreshResult>;
}): Promise<YouTubeResolution> {
  const now = input.now ?? Date.now();
  const credential = input.credential;
  if (!credential) {
    await input.setStatus("authorization_invalid");
    return { kind: "authorization_invalid" };
  }
  if (input.requiredScope && !credential.scopes.includes(input.requiredScope)) {
    await input.setStatus("permission_missing");
    return { kind: "permission_missing" };
  }
  if (credential.expiresAt && credential.expiresAt.getTime() > now + 60_000) {
    return { kind: "success", accessToken: credential.accessToken };
  }
  if (!credential.refreshToken) {
    await input.setStatus("authorization_invalid");
    return { kind: "authorization_invalid" };
  }
  if (credential.refreshTokenExpiresAt && credential.refreshTokenExpiresAt.getTime() <= now) {
    await input.setStatus("token_expired");
    return { kind: "token_expired" };
  }
  const result = await input.refresh(credential.refreshToken);
  if (result.kind === "authorization_invalid") {
    await input.setStatus("authorization_invalid");
    return result;
  }
  if (result.kind === "temporary_failure") {
    return credential.expiresAt && credential.expiresAt.getTime() > now
      ? { kind: "success", accessToken: credential.accessToken }
      : result;
  }
  await input.save({
    accessToken: result.accessToken,
    expiresAt: new Date(now + result.expiresIn * 1000),
    refreshToken: result.refreshToken,
    refreshTokenExpiresAt: result.refreshExpiresIn
      ? new Date(now + result.refreshExpiresIn * 1000) : result.refreshToken ? null : undefined
  });
  return { kind: "success", accessToken: result.accessToken };
}
