type PlatformAccount = {
  platform: string;
  status: string;
};

export const supportedPlatformIds = ["instagram", "facebook", "youtube", "tiktok", "pinterest"] as const;

export function filterSupportedPlatforms<T extends { platform: string }>(items: readonly T[]) {
  const supported = new Set<string>(supportedPlatformIds);

  return items.filter((item) => supported.has(item.platform));
}

export function countConnectedSupportedPlatforms(
  accounts: readonly PlatformAccount[],
  supportedPlatforms: readonly string[] = supportedPlatformIds
) {
  const supported = new Set(supportedPlatforms);

  return new Set(
    accounts
      .filter((account) => account.status === "active" && supported.has(account.platform))
      .map((account) => account.platform)
  ).size;
}
