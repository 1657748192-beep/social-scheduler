export type ProfileLinkAccount = { platform: string; providerAccountId: string; capabilities?: unknown };
export function socialAccountProfileUrl(account: ProfileLinkAccount): string | null {
  const {platform,providerAccountId:id}=account;
  if(platform==='facebook' && /^\d+$/.test(id)) return `https://www.facebook.com/profile.php?id=${id}`;
  if(platform==='youtube' && /^UC[\w-]{22}$/.test(id)) return `https://www.youtube.com/channel/${id}`;
  const metadata=account.capabilities && typeof account.capabilities==='object' && !Array.isArray(account.capabilities)
    ? account.capabilities as Record<string,unknown> : {};
  const username=metadata.profileUsername;
  const hosts:Record<string,string>={instagram:'www.instagram.com',tiktok:'www.tiktok.com',pinterest:'www.pinterest.com'};
  if(!hosts[platform]) return null;
  if(typeof metadata.profileUrl==='string') {
    try {
      const url=new URL(metadata.profileUrl);
      const hostsForPlatform=[hosts[platform],hosts[platform].replace(/^www\./,'')];
      const path=platform==='tiktok'?/^\/@[A-Za-z0-9_.-]+\/?$/:/^\/[A-Za-z0-9_.-]+\/?$/;
      const reserved=/^\/(accounts|login|oauth|explore|settings|developer|business|pin|reel|p)\/?$/i;
      if(url.protocol==='https:' && hostsForPlatform.includes(url.hostname) && !url.username && !url.password && !url.port && !url.search && !url.hash && path.test(url.pathname) && !reserved.test(url.pathname)) return url.href;
    } catch { /* Untrusted or obsolete metadata must never become a link. */ }
  }
  if(typeof username!=='string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(username) || /^(accounts|login|oauth|explore|settings|developer|business|pin|reel|p)$/i.test(username)) return null;
  return `https://${hosts[platform]}/${platform==='tiktok'?'@':''}${username}${platform==='tiktok'?'':'/'}`;
}
