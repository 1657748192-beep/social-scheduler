export const authorizationRefreshIntervalsMs = {
  youtube: 30 * 60_000,
  tiktok: 6 * 60 * 60_000,
  facebook: 24 * 60 * 60_000
} as const;

export type AuthorizationProvider = keyof typeof authorizationRefreshIntervalsMs;
type Checks = Record<AuthorizationProvider, () => Promise<number>>;
type WithLease = (provider: AuthorizationProvider, check: () => Promise<number>) => Promise<number | null>;

export async function runAuthorizationChecks(
  checks: Checks,
  withLease: WithLease,
  log: (line: string) => void = console.log,
  providers: readonly AuthorizationProvider[] = ["youtube", "tiktok", "facebook"]
): Promise<Record<AuthorizationProvider, number>> {
  const result = { youtube: 0, tiktok: 0, facebook: 0 };
  for (const provider of providers) {
    try {
      const checked = await withLease(provider, checks[provider]);
      if (checked !== null) {
        result[provider] = checked;
        if (checked) log(`Checked ${checked} ${provider} authorization(s)`);
      }
    } catch {
      log(`${provider} authorization check failed; will retry on the next scheduled scan`);
    }
  }
  return result;
}
