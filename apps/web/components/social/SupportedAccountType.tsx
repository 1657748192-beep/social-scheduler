'use client';
import React from 'react';
import {useLanguage} from '../LanguageProvider';

const accountTypes:Record<string,readonly [string,string]>={
  facebook:['公共主页（不支持个人账号）','Pages (personal profiles are not supported)'],
  instagram:['专业账号：商业／创作者','Professional accounts: Business / Creator'],
  tiktok:['个人／企业账号','Personal / Business accounts'],
  youtube:['YouTube 频道','YouTube channels'],
  pinterest:['企业账号','Business accounts'],
};

export function SupportedAccountType({platform,explain=false}:{platform:string;explain?:boolean}){
  const {t}=useLanguage();
  const labels=accountTypes[platform];
  if(!labels)return null;
  return explain?<div className="binding-account-type"><p>{t('支持绑定：','Supported account types: ')}{t(...labels)}</p><p className="muted">{t('实际可用功能以完成授权后的账号详情为准。','Available features depend on the permissions shown in account details after authorization.')}</p></div>:<small className="muted">{t(...labels)}</small>;
}
