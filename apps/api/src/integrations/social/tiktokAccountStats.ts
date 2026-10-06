export type TikTokAccountStatsResult =
  | { status: "ok"; followerCount: number; followingCount: number; likesCount: number; videoCount: number; fetchedAt?: string }
  | { status: "permission_missing" | "authorization_required" | "rate_limited" | "temporarily_unavailable" | "data_unavailable" | "account_unavailable" };

export async function queryTikTokAccountStats(token: string, accountId: string, fetcher: typeof fetch = fetch): Promise<TikTokAccountStatsResult> {
  try {
    const response = await fetcher("https://open.tiktokapis.com/v2/user/info/?fields=open_id,follower_count,following_count,likes_count,video_count", {
      method: "GET", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000)
    });
    const payload = await response.json().catch(() => null);
    const code = payload?.error?.code;
    if (code === "scope_not_authorized") return { status: "permission_missing" };
    if (response.status === 429 || code === "rate_limit_exceeded") return { status: "rate_limited" };
    if (response.status === 401 || code === "access_token_invalid" || code === "access_token_expired") return { status: "authorization_required" };
    if (!response.ok || code !== "ok") return { status: "temporarily_unavailable" };
    const user = payload?.data?.user;
    const counts = [user?.follower_count, user?.following_count, user?.likes_count, user?.video_count];
    if (user?.open_id !== accountId || !counts.every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) return { status: "data_unavailable" };
    return { status: "ok", followerCount: counts[0], followingCount: counts[1], likesCount: counts[2], videoCount: counts[3] };
  } catch { return { status: "temporarily_unavailable" }; }
}
