export type TikTokProfileResult = {status:'ok';username:string;profileUrl:string;fetchedAt:string} | {status:'data_unavailable'|'temporarily_unavailable'|'permission_missing'|'authorization_required'};
export async function queryTikTokProfile(token:string,openId:string,fetcher:typeof fetch=fetch):Promise<TikTokProfileResult> {
  try {
    const response = await fetcher('https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,profile_deep_link', {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000)
    });
    const body = await response.json();
    if (response.status === 401 || body.error?.code === 'access_token_invalid') return {status:'authorization_required'};
    if (response.status === 403 || body.error?.code === 'scope_not_authorized') return {status:'permission_missing'};
    if (response.status >= 500 || response.status === 429) return {status:'temporarily_unavailable'};
    const user = body.data?.user;
    if (!response.ok || body.error?.code !== 'ok' || user?.open_id !== openId ||
        typeof user.username !== 'string' || !/^[A-Za-z0-9._]{1,24}$/.test(user.username) || typeof user.profile_deep_link !== 'string') return {status:'data_unavailable'};
    const url = new URL(user.profile_deep_link);
    // TikTok may return a /t/ share link instead of a username permalink.
    // Use the verified API username; never follow user-controlled redirects.
    const profilePath = `/@${user.username}`;
    const officialShortLink = /^\/t\/[A-Za-z0-9]{1,100}\/$/.test(url.pathname);
    if (url.protocol !== 'https:' || url.hostname !== 'www.tiktok.com' || url.port || url.username || url.password || url.search || url.hash ||
        (url.pathname !== profilePath && !officialShortLink)) return {status:'data_unavailable'};
    return {status:'ok', username:user.username, profileUrl:`https://www.tiktok.com${profilePath}`, fetchedAt:new Date().toISOString()};
  } catch { return {status:'temporarily_unavailable'}; }
}
