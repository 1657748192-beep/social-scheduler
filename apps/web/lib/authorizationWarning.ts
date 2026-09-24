import type { SocialAccount } from "./api";

export function authorizationWarning(
  account: SocialAccount,
  now = Date.now()
): "soon" | "urgent" | "expired" | null {
  if (account.status !== "active" || !account.credential?.refreshTokenExpiresAt) return null;
  const remaining = new Date(account.credential.refreshTokenExpiresAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining > 30 * 86400000) return null;
  if (remaining <= 0) return "expired";
  return remaining <= 7 * 86400000 ? "urgent" : "soon";
}
