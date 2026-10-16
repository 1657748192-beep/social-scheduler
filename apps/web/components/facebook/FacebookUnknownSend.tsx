'use client';
import {useState} from 'react';
import {useLanguage} from '../LanguageProvider';
export function FacebookUnknownSend({onNewReply}:{onNewReply():void}){
  const {t}=useLanguage(),[checked,setChecked]=useState(false);
  return <div className="facebook-warning" role="status"><p>{t('发送结果未知，请先在官方后台核对。不会自动重发。','Send result unknown. Check the official inbox first. Nothing will be resent automatically.')}</p><a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">{t('打开 Meta Business Suite ↗','Open Meta Business Suite ↗')}</a><label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{t('我已核对，确认需要开始一条新的回复','I checked and confirm that a new reply is needed')}</label><button className="secondary" type="button" disabled={!checked} onClick={()=>{if(checked)onNewReply();}}>{t('开始新的回复（不自动发送）','Start a new reply (does not send)')}</button></div>;
}
