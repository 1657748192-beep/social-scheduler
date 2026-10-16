export function safeRequestLogUrl(url: string) {
  const path = url.split("?")[0];
  return /\/oauth\/(callback|start)\/?$/i.test(path) ? path : url;
}
