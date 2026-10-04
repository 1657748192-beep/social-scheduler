export function instagramProviderAccountSnapshot(
  platform: string,
  providerAccountId: string | null | undefined
): string | null {
  return platform === "instagram" && typeof providerAccountId === "string" && providerAccountId.trim()
    ? providerAccountId
    : null;
}
