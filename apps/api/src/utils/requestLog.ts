export function safeRequestLogUrl(url: string) {
  const path = url.split("?")[0];
  return path.endsWith("/oauth/callback") ? path : url;
}
