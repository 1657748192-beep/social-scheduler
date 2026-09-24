import type { Platform } from "@prisma/client";

export function expiryFromSeconds(value: unknown, now = Date.now()): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const timestamp = now + value * 1000;
  return Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15
    ? new Date(timestamp)
    : null;
}

export function refreshDeadline(
  platform: Platform,
  response: { refresh_expires_in?: unknown; refresh_token_expires_in?: unknown },
  now = Date.now()
): Date | null {
  if (platform === "tiktok") return expiryFromSeconds(response.refresh_expires_in, now);
  if (platform === "youtube") return expiryFromSeconds(response.refresh_token_expires_in, now);
  return null;
}
