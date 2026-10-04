export function instagramProviderAccountSnapshot(
  platform: string,
  providerAccountId: string | null | undefined
): string | null {
  return platform === "instagram" && typeof providerAccountId === "string" && providerAccountId.trim()
    ? providerAccountId
    : null;
}

export type InstagramAccountLinkState = "connected" | "reconnect" | "legacy_unverified";

export function instagramAccountLinkState(
  savedProviderAccountId: string | null | undefined,
  connectedProviderAccountId: string | null | undefined
): InstagramAccountLinkState {
  if (!savedProviderAccountId) return connectedProviderAccountId ? "connected" : "legacy_unverified";
  return savedProviderAccountId === connectedProviderAccountId ? "connected" : "reconnect";
}
