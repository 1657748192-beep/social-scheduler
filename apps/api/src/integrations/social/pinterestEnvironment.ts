export const pinterestApiEnvironments = ["production", "sandbox"] as const;

export type PinterestApiEnvironment = (typeof pinterestApiEnvironments)[number];

export function pinterestApiBaseUrl(environment: PinterestApiEnvironment) {
  return environment === "sandbox" ? "https://api-sandbox.pinterest.com/v5" : "https://api.pinterest.com/v5";
}

export function pinterestOAuthTokenUrl(environment: PinterestApiEnvironment) {
  return `${pinterestApiBaseUrl(environment)}/oauth/token`;
}

export function pinterestProfileUrl(environment: PinterestApiEnvironment) {
  return `${pinterestApiBaseUrl(environment)}/user_account`;
}

export function assertPinterestAccountEnvironment(capabilities: unknown, environment: PinterestApiEnvironment) {
  const storedEnvironment =
    capabilities && typeof capabilities === "object" && !Array.isArray(capabilities)
      ? (capabilities as Record<string, unknown>).pinterestApiEnvironment
      : undefined;

  if (storedEnvironment !== environment) {
    throw new Error(
      "This Pinterest account was connected for another API environment. Reconnect the Pinterest account before using it here."
    );
  }
}
