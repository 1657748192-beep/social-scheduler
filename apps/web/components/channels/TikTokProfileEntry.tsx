"use client";
import React,{useEffect,useRef,useState,type ReactNode} from 'react';
import {apiRequest,UploadHttpError} from '../../lib/api';
import {useLanguage} from '../LanguageProvider';

type Status={eligible:boolean;connected:boolean;profileGranted?:boolean;accountId?:string};
type Profile={status:string;username?:string;profileUrl?:string};
export function TikTokProfileEntry({accountId,workspaceId,token,fallback}:{accountId:string;workspaceId:string;token:string;fallback:ReactNode}){
 const {t}=useLanguage();
 const [status,setStatus]=useState<Status|null>(null),[profile,setProfile]=useState<Profile|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const active=useRef(false),running=useRef(false),controller=useRef<AbortController|null>(null);
 const base=`/workspaces/${encodeURIComponent(workspaceId)}/tiktok-sandbox`;
 useEffect(()=>{active.current=true;const read=new AbortController();
  void apiRequest<Status>(`${base}/status`,{token,signal:read.signal}).then(s=>{if(active.current)setStatus(s);}).catch(()=>{});
  return()=>{active.current=false;read.abort();controller.current?.abort();};
 },[base,token]);
 if(!status?.eligible||status.accountId!==accountId)return <>{fallback}</>;
 const authorize=!status.connected||!status.profileGranted;
 async function action(){
  if(running.current)return;running.current=true;setBusy(true);setError(false);setProfile(null);
  const request=new AbortController();controller.current=request;
  try{
   if(authorize){
    const result=await apiRequest<{authorizationUrl:string}>(`${base}/oauth/start`,{token,method:'POST',signal:request.signal});
    const url=new URL(result.authorizationUrl);
    if(url.protocol!=='https:'||url.hostname!=='www.tiktok.com'||url.port||url.username||url.password||url.pathname!=='/v2/auth/authorize/'||!url.searchParams.get('state'))throw Error('Invalid authorization destination');
    if(active.current)window.location.assign(url.href);
   }else{
    const result=await apiRequest<Profile>(`${base}/profile`,{token,signal:request.signal});
    if(!active.current)return;
    if(result.status==='permission_missing'||result.status==='authorization_required')setStatus(s=>s?{...s,profileGranted:false}:s);
    if(result.status!=='ok'||typeof result.username!=='string'||! /^[A-Za-z0-9._]{1,24}$/.test(result.username)||result.profileUrl!==`https://www.tiktok.com/@${result.username}`){setError(true);return;}
    setProfile(result);
   }
  }catch(e){if(active.current){setError(true);if(e instanceof UploadHttpError&&[400,401,403].includes(e.status))setStatus(s=>s?{...s,profileGranted:false}:s);}}
  finally{running.current=false;if(active.current)setBusy(false);}
 }
 return <span className="tiktok-profile-entry" aria-busy={busy}>
  <button className="button secondary" type="button" disabled={busy} onClick={()=>void action()}>{busy?t('正在处理…','Working…'):authorize?t('授权主页信息','Authorize profile access'):t('获取主页链接','Get profile link')}</button>
  {profile?<><span>@{profile.username}</span><a className="button secondary" href={profile.profileUrl} target="_blank" rel="noopener noreferrer">{t('查看主页','View profile')} ↗</a></>:null}
  {error?<small role="status">{t('暂未获取主页链接，请检查测试授权后重试。','Profile link unavailable. Check the test authorization and retry.')}</small>:null}
  <small className="muted">{t('仅指定账号测试，不更改发布授权。','Designated-account test; publishing authorization is unchanged.')}</small>
 </span>;
}
