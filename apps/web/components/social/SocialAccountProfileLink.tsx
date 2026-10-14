"use client";
import { useLanguage } from '../LanguageProvider';

export function SocialAccountProfileLink({platform,profileUrl}: {platform: string; profileUrl?: string | null}) {
  const {t}=useLanguage();
  const hosts:Record<string,string[]>= {facebook:['www.facebook.com','facebook.com'],instagram:['www.instagram.com','instagram.com'],youtube:['www.youtube.com','youtube.com'],tiktok:['www.tiktok.com','tiktok.com'],pinterest:['www.pinterest.com','pinterest.com']};
  let safe=false;
  try { const url=new URL(profileUrl ?? ''); safe=url.protocol==='https:' && (hosts[platform]??[]).includes(url.hostname) && !url.username && !url.password && !url.port; } catch {}
  if(!safe) return <span className="muted account-profile-unavailable">{t('主页链接暂不可用','Profile link unavailable')}</span>;
  return <a className="button secondary account-profile-link" href={profileUrl!} target="_blank" rel="noopener noreferrer">
    {platform==='facebook'?t('查看公共主页','View Page'):t('查看主页','View profile')} <span aria-hidden="true">↗</span>
  </a>;
}
