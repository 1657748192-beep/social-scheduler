type InstagramTokenPayload = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { code?: number; error_subcode?: number; message?: string };
};

export type InstagramRefreshResult =
  | { kind: "success"; accessToken: string; expiresIn: number }
  | { kind: "authorization_invalid" }
  | { kind: "temporary_failure"; message: string };

export type InstagramTokenResolution =
  | { kind: "success"; accessToken: string }
  | { kind: "authorization_invalid" }
  | { kind: "permission_missing" }
  | { kind: "token_expired" }
  | { kind: "temporary_failure"; message: string };

export function classifyInstagramApiFailure(status: number, error: { code?: number }) {
  if (status >= 500 || status === 429) return "temporary_failure" as const;
  if (error.code === 190) return "authorization_invalid" as const;
  if (error.code === 10 || error.code === 200) return "permission_missing" as const;
  return "request_failed" as const;
}

export function shouldMarkInstagramAuthFailure(currentToken: string, usedToken: string) {
  return currentToken === usedToken;
}

export async function exchangeInstagramLongLivedToken(input: {
  shortLivedToken: string;
  clientSecret: string;
  fetcher?: typeof fetch;
}) {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", input.clientSecret);
  url.searchParams.set("access_token", input.shortLivedToken);
  const response = await (input.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(10000) });
  const payload = (await response.json().catch(() => null)) as InstagramTokenPayload | null;
  if (!response.ok || !payload?.access_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in < 86400) {
    throw new Error("Instagram long-lived token exchange failed. Please authorize the account again.");
  }
  return {
    access_token: payload.access_token,
    token_type: payload.token_type,
    expires_in: payload.expires_in
  };
}

export function shouldRefreshInstagramToken(expiresAt: Date | null, now = Date.now()) {
  return Boolean(expiresAt && expiresAt.getTime() > now && expiresAt.getTime() <= now + 7 * 86400000);
}

export async function refreshInstagramToken(input: {
  accessToken: string;
  fetcher?: typeof fetch;
}): Promise<InstagramRefreshResult> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", input.accessToken);
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    return { kind: "temporary_failure", message: "Instagram token refresh could not reach Meta." };
  }
  const payload = (await response.json().catch(() => null)) as InstagramTokenPayload | null;
  if (!response.ok) {
    if (classifyInstagramApiFailure(response.status, payload?.error ?? {}) === "authorization_invalid") {
      return { kind: "authorization_invalid" };
    }
    return { kind: "temporary_failure", message: `Instagram token refresh failed (${response.status}).` };
  }
  if (!payload?.access_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in < 86400) {
    return { kind: "temporary_failure", message: "Instagram token refresh returned incomplete credentials." };
  }
  return { kind: "success", accessToken: payload.access_token, expiresIn: payload.expires_in };
}

export async function resolveInstagramAccessToken(input: {
  credential: { accessToken: string; expiresAt: Date | null; scopes: string[] } | null;
  requiredScope?: string;
  now?: number;
  save: (update: { accessToken: string; expiresAt: Date }) => Promise<void>;
  setStatus: (status: "authorization_invalid" | "permission_missing" | "token_expired") => Promise<void>;
  refresh: (accessToken: string) => Promise<InstagramRefreshResult>;
}): Promise<InstagramTokenResolution> {
  const now = input.now ?? Date.now();
  const credential = input.credential;
  if (!credential || !credential.expiresAt) {
    await input.setStatus("authorization_invalid");
    return { kind: "authorization_invalid" };
  }
  if (input.requiredScope && !credential.scopes.includes(input.requiredScope)) {
    await input.setStatus("permission_missing");
    return { kind: "permission_missing" };
  }
  if (credential.expiresAt.getTime() <= now) {
    await input.setStatus("token_expired");
    return { kind: "token_expired" };
  }
  if (!shouldRefreshInstagramToken(credential.expiresAt, now)) {
    return { kind: "success", accessToken: credential.accessToken };
  }
  const result = await input.refresh(credential.accessToken);
  if (result.kind === "authorization_invalid") {
    await input.setStatus("authorization_invalid");
    return result;
  }
  if (result.kind === "temporary_failure") {
    return { kind: "success", accessToken: credential.accessToken };
  }
  await input.save({ accessToken: result.accessToken, expiresAt: new Date(now + result.expiresIn * 1000) });
  return { kind: "success", accessToken: result.accessToken };
}
