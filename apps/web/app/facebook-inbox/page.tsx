'use client';
import React,{useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {PlatformAdminOnly} from '../../components/facebook/PlatformAdminOnly';
import {apiRequest,type Workspace} from '../../lib/api';
import {parseLegacyInboxQuery} from '../../lib/interactionInbox';
import {useLanguage} from '../../components/LanguageProvider';
export default function FacebookInboxPage(){return <PlatformAdminOnly><LegacyInboxRedirect/></PlatformAdminOnly>;}
function LegacyInboxRedirect(){
 const router=useRouter(),{t}=useLanguage(),[failed,setFailed]=useState(false);
 useEffect(()=>{let current=true;const controller=new AbortController();
  void (async()=>{try{const token=window.localStorage.getItem('social_scheduler_token');if(!token)throw Error('Session required');const raw=new URLSearchParams(window.location.search),context=parseLegacyInboxQuery(window.location.search);if(['workspaceId','managedPageId','connectionId'].some(k=>raw.has(k))&&!context)throw Error('Invalid legacy context');
   const spaces=await apiRequest<Workspace[]>('/workspaces',{token,signal:controller.signal});if(context&&!spaces.some(w=>w.id===context.workspaceId))throw Error('Workspace unavailable');
   const next=new URLSearchParams({platform:'facebook',kind:'messages',...(context??{})});if(current)router.replace('/inbox?'+next.toString());
  }catch{if(current)setFailed(true);}})();return()=>{current=false;controller.abort();};
 },[router]);
 return <section className="panel"><p role={failed?'alert':'status'}>{failed?t('原收件箱定位不可用，请从互动收件箱重新选择；不会自动换账号。','Legacy context unavailable. Select an account in the unified inbox; no automatic fallback occurs.'):t('正在验证工作区并打开互动收件箱…','Checking workspace access and opening the unified inbox…')}</p>{failed?<a href="/inbox">{t('打开互动收件箱','Open interaction inbox')}</a>:null}</section>;
}
