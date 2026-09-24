export type FacebookPageCheckResult =
  | { kind: "success"; expiresAt: Date | null }
  | { kind: "authorization_invalid" }
  | { kind: "permission_missing" }
  | { kind: "temporary_failure"; message: string };

type FacebookGraphError = { error?: { code?: number } };

export function normalizeFacebookPageExpiry(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value * 1000 <= 8.64e15
    ? new Date(value * 1000) : null;
}

export function classifyFacebookPageFailure(status: number, code?: number) {
  if (status === 429 || status >= 500) return "temporary_failure" as const;
  if (code === 190) return "authorization_invalid" as const;
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) return "permission_missing" as const;
  return "request_failed" as const;
}

function failure(status: number, code?: number): FacebookPageCheckResult {
  const kind = classifyFacebookPageFailure(status, code);
  return kind === "authorization_invalid" || kind === "permission_missing"
    ? { kind }
    : { kind: "temporary_failure", message: `Facebook Page authorization check failed (${status}).` };
}

export async function checkFacebookPageCredential(input: {
  pageId: string;
  pageToken: string;
  appId: string;
  appSecret: string;
  fetcher?: typeof fetch;
}): Promise<FacebookPageCheckResult> {
  const fetcher = input.fetcher ?? fetch;
  const debugUrl = new URL("https://graph.facebook.com/v20.0/debug_token");
  debugUrl.searchParams.set("input_token", input.pageToken);
  debugUrl.searchParams.set("access_token", `${input.appId}|${input.appSecret}`);
  let debugResponse: Response;
  try {
    debugResponse = await fetcher(debugUrl, { signal: AbortSignal.timeout(10000) });
  } catch {
    return { kind: "temporary_failure", message: "Facebook Page authorization check could not reach Meta." };
  }
  const debugPayload = (await debugResponse.json().catch(() => null)) as (FacebookGraphError & {
    data?: {
      app_id?: string;
      type?: string;
      is_valid?: boolean;
      expires_at?: number;
      scopes?: string[];
      granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
    };
  }) | null;
  if (!debugResponse.ok) return failure(debugResponse.status, debugPayload?.error?.code);
  const data = debugPayload?.data;
  if (!data) return { kind: "temporary_failure", message: "Meta did not return Page authorization details." };
  if (!data.is_valid || data.app_id !== input.appId || data.type !== "PAGE") {
    return { kind: "authorization_invalid" };
  }
  const requiredScopes = ["pages_manage_posts", "pages_read_engagement"];
  if (!requiredScopes.every((scope) => data.scopes?.includes(scope))) return { kind: "permission_missing" };
  if (data.granular_scopes?.some((scope) =>
    requiredScopes.includes(scope.scope ?? "") && scope.target_ids?.length && !scope.target_ids.includes(input.pageId)
  )) return { kind: "permission_missing" };

  const pageUrl = new URL(`https://graph.facebook.com/v20.0/${encodeURIComponent(input.pageId)}`);
  pageUrl.searchParams.set("fields", "id");
  let pageResponse: Response;
  try {
    pageResponse = await fetcher(pageUrl, {
      headers: { Authorization: `Bearer ${input.pageToken}` },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return { kind: "temporary_failure", message: "Facebook Page identity check could not reach Meta." };
  }
  const pagePayload = (await pageResponse.json().catch(() => null)) as (FacebookGraphError & { id?: string }) | null;
  if (!pageResponse.ok) return failure(pageResponse.status, pagePayload?.error?.code);
  if (!pagePayload?.id) return { kind: "temporary_failure", message: "Meta did not return the selected Page identity." };
  if (pagePayload.id !== input.pageId) return { kind: "authorization_invalid" };
  return { kind: "success", expiresAt: normalizeFacebookPageExpiry(data.expires_at) };
}
