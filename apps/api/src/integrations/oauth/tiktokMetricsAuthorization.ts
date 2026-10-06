import { HttpError } from "../../utils/errors";

export function validateTikTokMetricsGrant(scope: string | undefined, existingScopes: string[]) {
  const granted = scope?.split(/[ ,]+/).filter(Boolean) ?? [];
  if (!granted.length) throw new HttpError(400, "TikTok did not return granted permissions; the existing connection was not changed.");
  if (["video.publish", "video.upload"].some((item) => existingScopes.includes(item) && !granted.includes(item))) {
    throw new HttpError(400, "TikTok publishing permissions were not retained; the existing connection was not changed. Reauthorize with publishing enabled.");
  }
  return granted;
}
