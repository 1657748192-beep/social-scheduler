type PlatformAccount = {
  platform: string;
  status: string;
};

export function countConnectedSupportedPlatforms(
  accounts: readonly PlatformAccount[],
  supportedPlatforms: readonly string[]
) {
  const supported = new Set(supportedPlatforms);

  return new Set(
    accounts
      .filter((account) => account.status === "active" && supported.has(account.platform))
      .map((account) => account.platform)
  ).size;
}
