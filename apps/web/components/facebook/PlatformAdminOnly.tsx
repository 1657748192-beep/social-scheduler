'use client';
import React,{useEffect,useState,type ReactNode} from 'react';
import {apiRequest,type CurrentUser} from '../../lib/api';
import {useLanguage} from '../LanguageProvider';

export function PlatformAdminOnly({children}:{children:ReactNode}){
  const {t}=useLanguage();
  const [access,setAccess]=useState<'loading'|'allowed'|'denied'>('loading');
  useEffect(()=>{
    let current=true;const controller=new AbortController();
    try{
      const token=window.localStorage.getItem('social_scheduler_token');
      if(!token){setAccess('denied');return;}
      void apiRequest<CurrentUser>('/auth/me',{token,signal:controller.signal}).then(user=>{if(current)setAccess(user.isPlatformAdmin===true?'allowed':'denied');}).catch(()=>{if(current)setAccess('denied');});
    }catch{setAccess('denied');}
    return()=>{current=false;controller.abort();};
  },[]);
  if(access==='allowed')return <>{children}</>;
  return <section className="panel"><p role="status">{access==='loading'?t('正在验证访问权限…','Checking access…'):t('此功能仅限平台管理员内测，暂未向客户开放。','This feature is currently restricted to platform administrators.')}</p></section>;
}
