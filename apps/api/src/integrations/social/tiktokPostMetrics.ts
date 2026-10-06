export type TikTokMetricsResult =
  | { status: "ok"; viewCount: number; likeCount: number; commentCount: number; shareCount: number; fetchedAt?: string }
  | { status: "permission_missing" | "authorization_required" | "rate_limited" | "temporarily_unavailable" |
      "video_unavailable" | "private_video" | "video_id_missing" | "account_unavailable" };

export async function queryTikTokPostMetrics(
  accessToken: string, videoId: string, fetcher: typeof fetch = fetch
): Promise<TikTokMetricsResult> {
  try {
    const response = await fetcher(
      "https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters: { video_ids: [videoId] } }),
        signal: AbortSignal.timeout(10000)
      }
    );
    const payload = await response.json().catch(() => null);
    const code = payload?.error?.code;
    if (code === "scope_not_authorized") return { status: "permission_missing" };
    if (response.status === 429 || code === "rate_limit_exceeded") return { status: "rate_limited" };
    if (response.status === 401 || code === "access_token_invalid" || code === "access_token_expired") {
      return { status: "authorization_required" };
    }
    if (!response.ok || code !== "ok") return { status: "temporarily_unavailable" };
    const video = Array.isArray(payload?.data?.videos)
      ? payload.data.videos.find((item: { id?: unknown } | null) => item?.id === videoId) : undefined;
    const counts = [video?.view_count, video?.like_count, video?.comment_count, video?.share_count];
    if (!counts.every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)) {
      return { status: "video_unavailable" };
    }
    return { status: "ok", viewCount: counts[0], likeCount: counts[1], commentCount: counts[2], shareCount: counts[3] };
  } catch {
    // Never return raw upstream errors, which can contain credentials or request details.
    return { status: "temporarily_unavailable" };
  }
}
