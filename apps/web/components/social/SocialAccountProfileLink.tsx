"use client";
import { useLanguage } from '../LanguageProvider';
import React from 'react';
import {TikTokProfileEntry} from '../channels/TikTokProfileEntry';

export function SocialAccountProfileLink({platform,profileUrl,accountId,token,workspaceId,accountStatus}: {platform: string; profileUrl?: string | null;accountId?:string;token?:string;workspaceId?:string;accountStatus?:string}) {
  const {t}=useLanguage();
  const hosts:Record<string,string[]>= {facebook:['www.facebook.com','facebook.com'],instagram:['www.instagram.com','instagram.com'],youtube:['www.youtube.com','youtube.com'],tiktok:['www.tiktok.com','tiktok.com'],pinterest:['www.pinterest.com','pinterest.com']};
  let safe=false;
  try { const url=new URL(profileUrl ?? ''); safe=url.protocol==='https:' && (hosts[platform]??[]).includes(url.hostname) && !url.username && !url.password && !url.port; } catch {}
  const fallback=!safe?<span className="muted account-profile-unavailable">{t('主页链接暂不可用','Profile link unavailable')}</span>:<a className="button secondary account-profile-link" href={profileUrl!} target="_blank" rel="noopener noreferrer">
    {platform==='facebook'?t('查看公共主页','View Page'):t('查看主页','View profile')} <span aria-hidden="true">↗</span>
  </a>;
  if(platform==='tiktok'&&accountId&&token&&workspaceId&&['active','token_expired'].includes(accountStatus??''))return <TikTokProfileEntry key={`${workspaceId}:${accountId}:${token}:${accountStatus}`} {...{accountId,token,workspaceId,fallback}}/>;
  return fallback;
}
