import type { TikTokMetricsResult } from "./tiktokPostMetrics";

// Status lookup is read-only and must use the original publishing app's token.
// Do not guess by caption/date or use the Sandbox token for a production publish_id.
export async function resolveTikTokPublishedVideo(accessToken: string, publishId: string, fetcher: typeof fetch = fetch): Promise<
  { status: "ok"; videoId: string } | Exclude<TikTokMetricsResult, { status: "ok" }>
> {
  try {
    const response = await fetcher("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ publish_id: publishId }), signal: AbortSignal.timeout(10000)
    });
    // TikTok documents int64 IDs. Quote integer tokens before JSON.parse to avoid
    // irreversible IEEE-754 rounding; already quoted string IDs remain unchanged.
    const text = await response.text();
    const payload = JSON.parse(text.replace(/("publicaly_available_post_id"\s*:\s*\[)([^\]]*)(\])/g,
      (_all, start, ids, end) => start + ids.replace(/(^|,)\s*(\d+)\s*(?=,|$)/g, '$1"$2"') + end));
    const code = payload?.error?.code;
    if (response.status === 429 || code === "rate_limit_exceeded") return { status: "rate_limited" };
    if (response.status === 401 || ["access_token_invalid", "access_token_expired", "scope_not_authorized", "token_not_authorized_for_specified_publish_id"].includes(code)) return { status: "authorization_required" };
    if (code === "invalid_publish_id") return { status: "video_id_missing" };
    if (!response.ok || code !== "ok") return { status: "temporarily_unavailable" };
    const ids = payload?.data?.publicaly_available_post_id;
    if (payload?.data?.status !== "PUBLISH_COMPLETE" || !Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== "string" || !/^\d{10,30}$/.test(ids[0])) return { status: "video_id_missing" };
    return { status: "ok", videoId: ids[0] };
  } catch { return { status: "temporarily_unavailable" }; }
}
