'use client';
import React from 'react';import {useLanguage} from '../../LanguageProvider';
import type {InboxPage,InboxCase} from '../../../lib/interactionInbox';import {CapabilityNotice} from './CapabilityNotice';
export function SyncCoverageNotice({page}:{page:InboxPage<InboxCase>}){
 const {t}=useLanguage(),states=page.accountsStatus;
 const synchronized=states.reduce((sum,s)=>sum+(typeof s.synchronizedCount==='number'&&Number.isSafeInteger(s.synchronizedCount)&&s.synchronizedCount>0?s.synchronizedCount:0),0);
 const historyOnly=states.length>0&&states.every(s=>s.status==='ok'||(['incomplete','not_synced'].includes(s.status)&&s.synchronizedCount!==undefined&&s.synchronizedCount>0));
 return <>{synchronized>0?<p className="muted" role="status">{t(`当前筛选下已同步 ${synchronized} 条互动，可查看已同步记录。`,`${synchronized} synchronized interaction${synchronized===1?'':'s'} match the current filters and can be viewed.`)}{page.partial&&historyOnly?' '+t('历史同步尚未完成，不能据此认定没有其他消息。','History synchronization is incomplete; other messages may exist.'):''}</p>:null}{page.partial&&!historyOnly?<CapabilityNotice reason="unavailable"/>:null}</>;
}
