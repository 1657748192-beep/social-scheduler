export function safeRequestLogUrl(url: string) {
  const path = url.split("?")[0];
  if(path.includes('/instagram-management'))return '/api/v1/instagram-management/[redacted]';
  if(path.includes('/interaction-inbox'))return '/api/v1/workspaces/[redacted]/interaction-inbox/[redacted]';
  if(path.includes('/facebook-page-sync/'))return path.replace(/(\/facebook-page-sync\/)(?!start(?:\/|$))[^/]+/,'$1[redacted]');
  return /\/oauth\/(callback|start)\/?$/i.test(path) ? path : url;
}
