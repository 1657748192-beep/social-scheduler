import { HttpError } from "../../utils/errors";

const scopes = ["user.info.basic", "video.list", "user.info.stats"];
export type SandboxIdentity = { openId: string; unionId: string };
export type SandboxToken = { accessToken: string; refreshToken?: string; openId: string; scopes: string[]; expiresIn: number; refreshExpiresIn?: number };
export function validateSandboxGrant(value: unknown): string[] {
  const granted = typeof value === "string" ? value.split(/[ ,]+/).filter(Boolean) : [];
  if (!scopes.every(scope => granted.includes(scope))) throw new HttpError(400, "Sandbox read permissions are missing");
  return granted;
}
export function validateSandboxIdentity(identity: SandboxIdentity, expectedUnionId: string, tokenOpenId: string) {
  if (!identity.openId || !identity.unionId || !expectedUnionId || identity.unionId !== expectedUnionId || identity.openId !== tokenOpenId) {
    throw new HttpError(400, "Sandbox account identity does not match");
  }
}
export function sandboxAuthorizationUrl(clientKey: string, redirectUri: string, state: string) {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({ client_key: clientKey, response_type: "code", scope: scopes.join(","), redirect_uri: redirectUri, state, disable_auto_auth: "1" }).toString();
  return url.toString();
}
export function createTikTokSandboxAPI(fetcher: typeof fetch = fetch) {
  async function request(path: string, init: RequestInit) {
    try {
      const response = await fetcher(`https://open.tiktokapis.com${path}`, { ...init, signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (!response.ok || (body.error && body.error.code !== "ok")) throw new Error();
      return body;
    } catch { throw new HttpError(502, "TikTok sandbox request failed"); }
  }
  async function token(clientKey: string, clientSecret: string, params: Record<string, string>): Promise<SandboxToken> {
    const body = await request("/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, ...params }) });
    if (typeof body.access_token !== "string" || !body.access_token || typeof body.open_id !== "string" || !body.open_id ||
        !Number.isSafeInteger(body.expires_in) || body.expires_in <= 0 || body.expires_in > 31536000 ||
        (body.refresh_token !== undefined && (typeof body.refresh_token !== "string" || !body.refresh_token)) ||
        (body.refresh_expires_in !== undefined && (!Number.isSafeInteger(body.refresh_expires_in) || body.refresh_expires_in <= 0 || body.refresh_expires_in > 315360000))) {
      throw new HttpError(502, "TikTok sandbox token response is incomplete");
    }
    return { accessToken: body.access_token, refreshToken: body.refresh_token, openId: body.open_id, scopes: validateSandboxGrant(body.scope), expiresIn: body.expires_in, refreshExpiresIn: body.refresh_expires_in };
  }
  return {
    async identity(accessToken: string): Promise<SandboxIdentity> {
      const body = await request("/v2/user/info/?fields=open_id,union_id", { headers: { Authorization: `Bearer ${accessToken}` } });
      const user = body.data?.user;
      if (body.error?.code !== "ok" || typeof user?.open_id !== "string" || !user.open_id || typeof user?.union_id !== "string" || !user.union_id) throw new HttpError(400, "TikTok account identity is unavailable");
      return { openId: user.open_id, unionId: user.union_id };
    },
    async creator(accessToken: string): Promise<string> {
      const body = await request("/v2/post/publish/creator_info/query/", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: "{}" });
      if (body.error?.code !== "ok" || typeof body.data?.creator_username !== "string") throw new HttpError(400, "TikTok creator identity is unavailable");
      return body.data.creator_username;
    },
    exchange: (key: string, secret: string, input: { code: string; redirectUri: string }) => token(key, secret, { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri }),
    refresh: (key: string, secret: string, refreshToken: string) => token(key, secret, { grant_type: "refresh_token", refresh_token: refreshToken })
  };
}
