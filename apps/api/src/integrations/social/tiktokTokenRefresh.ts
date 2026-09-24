import { expiryFromSeconds } from "./oauthExpiry";

export type TikTokRefreshResult =
  | { kind: "success"; accessToken: string; refreshToken?: string; expiresIn: number; refreshExpiresIn?: number }
  | { kind: "authorization_invalid" }
  | { kind: "token_expired" }
  | { kind: "temporary_failure"; message: string };

export type TikTokResolution =
  | { kind: "success"; accessToken: string }
  | { kind: "authorization_invalid" }
  | { kind: "permission_missing" }
  | { kind: "token_expired" }
  | { kind: "temporary_failure"; message: string };

export type TikTokLockedCredential = {
  status: "active" | "token_expired";
  credential: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
    refreshTokenExpiresAt: Date | null;
    scopes: string[];
  } | null;
  save: (update: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    refreshTokenExpiresAt?: Date | null;
  }) => Promise<void>;
  setStatus: (status: "active" | "authorization_invalid" | "permission_missing" | "token_expired") => Promise<void>;
};

export function classifyTikTokTokenFailure(status: number, error?: string) {
  if (status === 429 || status >= 500) return "temporary_failure" as const;
  if (error === "refresh_token_expired") return "token_expired" as const;
  if (error === "invalid_grant" || error === "token_revoked") {
    return "authorization_invalid" as const;
  }
  return "request_failed" as const;
}

export function classifyTikTokApiFailure(status: number, code?: string) {
  if (status === 429 || status >= 500) return "temporary_failure" as const;
  if (code === "scope_not_authorized") return "permission_missing" as const;
  return "request_failed" as const;
}

export async function refreshTikTokToken(input: {
  refreshToken: string;
  clientKey: string;
  clientSecret: string;
  fetcher?: typeof fetch;
}): Promise<TikTokRefreshResult> {
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_key: input.clientKey,
        client_secret: input.clientSecret
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return { kind: "temporary_failure", message: "TikTok token refresh could not reach TikTok." };
  }
  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    refresh_expires_in?: unknown;
    error?: string;
  } | null;
  if (!response.ok) {
    const kind = classifyTikTokTokenFailure(response.status, payload?.error);
    return kind === "authorization_invalid" || kind === "token_expired"
      ? { kind }
      : { kind: "temporary_failure", message: `TikTok token refresh failed (${response.status}).` };
  }
  if (typeof payload?.access_token !== "string" || !payload.access_token ||
      !expiryFromSeconds(payload.expires_in, 0)) {
    return { kind: "temporary_failure", message: "TikTok token refresh returned incomplete credentials." };
  }
  return {
    kind: "success",
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" && payload.refresh_token ? payload.refresh_token : undefined,
    expiresIn: payload.expires_in as number,
    refreshExpiresIn: expiryFromSeconds(payload.refresh_expires_in, 0)
      ? payload.refresh_expires_in as number : undefined
  };
}

export async function resolveTikTokAccessToken(input: {
  accountId: string;
  requiredScope?: string;
  now?: number;
  refreshWithinMs?: number;
  rejectedAccessToken?: string;
  withLock: (id: string, work: (locked: TikTokLockedCredential) => Promise<TikTokResolution>) => Promise<TikTokResolution>;
  exchange: (refreshToken: string) => Promise<TikTokRefreshResult>;
}): Promise<TikTokResolution> {
  const now = input.now ?? Date.now();
  return input.withLock(input.accountId, async (locked) => {
    const credential = locked.credential;
    if (!credential) {
      await locked.setStatus("authorization_invalid");
      return { kind: "authorization_invalid" };
    }
    if (input.requiredScope && !credential.scopes.includes(input.requiredScope)) {
      await locked.setStatus("permission_missing");
      return { kind: "permission_missing" };
    }
    if (input.rejectedAccessToken && locked.status === "active" &&
        credential.accessToken !== input.rejectedAccessToken &&
        credential.expiresAt && credential.expiresAt.getTime() > now + 60_000) {
      return { kind: "success", accessToken: credential.accessToken };
    }
    if (locked.status === "active" && credential.expiresAt && credential.expiresAt.getTime() > now + (input.refreshWithinMs ?? 60_000)) {
      return { kind: "success", accessToken: credential.accessToken };
    }
    if (!credential.refreshToken) {
      await locked.setStatus("authorization_invalid");
      return { kind: "authorization_invalid" };
    }
    if (credential.refreshTokenExpiresAt && credential.refreshTokenExpiresAt.getTime() <= now) {
      await locked.setStatus("token_expired");
      return { kind: "token_expired" };
    }
    const result = await input.exchange(credential.refreshToken);
    if (result.kind === "authorization_invalid") {
      await locked.setStatus("authorization_invalid");
      return result;
    }
    if (result.kind === "token_expired") {
      await locked.setStatus("token_expired");
      return result;
    }
    if (result.kind === "temporary_failure") {
      return locked.status === "active" && credential.expiresAt && credential.expiresAt.getTime() > now
        ? { kind: "success", accessToken: credential.accessToken } : result;
    }
    const expiresAt = expiryFromSeconds(result.expiresIn, now);
    if (!expiresAt) return { kind: "temporary_failure", message: "TikTok returned an invalid access-token lifetime." };
    await locked.save({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt,
      refreshTokenExpiresAt: result.refreshExpiresIn
        ? expiryFromSeconds(result.refreshExpiresIn, now) : result.refreshToken ? null : undefined
    });
    if (locked.status === "token_expired") await locked.setStatus("active");
    return { kind: "success", accessToken: result.accessToken };
  });
}
