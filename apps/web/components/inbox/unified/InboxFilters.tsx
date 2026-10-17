'use client';
import React,{useState,type ReactNode} from 'react';
import {useLanguage} from '../../LanguageProvider';
import {inboxPlatforms,type InboxKind,type InboxTag} from '../../../lib/interactionInbox';
import {InboxIcon} from './InboxIcon';
type Props={kind:InboxKind;platform:string;q:string;status:string;unread:string;searchMessages:boolean;tagIds:string[];tags:InboxTag[];from:string;onChange:(v:Record<string,unknown>)=>void;section?:'header'|'list';actions?:ReactNode;accountPicker?:ReactNode};
const names:Record<string,string>={facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube',pinterest:'Pinterest'};
export function InboxFilters({kind,platform,q,status,unread,searchMessages,tagIds,tags,from,onChange,section='header',actions,accountPicker}:Props){
 const {t}=useLanguage(),[advanced,setAdvanced]=useState(false);
 if(section==='header')return <header className="inbox-header-controls">
  <div className="inbox-heading-row"><div className="inbox-tabs" role="tablist" aria-label={t('互动类型','Interaction type')}>
   {(['comments','messages','mentions'] as const).map((value,i)=><button type="button" role="tab" aria-selected={kind===value} key={value} onClick={()=>onChange({kind:value})}>{t(['评论','私信','@提及'][i],['Comments','Messages','@Mentions'][i])}</button>)}
  </div><div className="inbox-header-actions">{actions}</div></div>
  <div className="inbox-platform-row"><div className="inbox-platforms" aria-label={t('平台筛选','Platform filter')}><button type="button" aria-pressed={platform==='all'} onClick={()=>onChange({platform:'all'})}>{t('全部平台','All platforms')}</button>{inboxPlatforms.map(p=><button type="button" key={p} data-platform={p} aria-pressed={platform===p} onClick={()=>onChange({platform:p})}>{names[p]}</button>)}</div><div className="inbox-account-picker">{accountPicker}</div></div>
 </header>;
 return <div className="inbox-list-tools">
  <label className="inbox-search"><InboxIcon name="search"/><input aria-label={t('搜索客户','Search customers')} placeholder={t('搜索客户、标签或备注','Search customers, labels or notes')} value={q} maxLength={100} onChange={e=>onChange({q:e.target.value})}/></label>
  <div className="inbox-list-filter-row"><div className="inbox-status-tabs"><button type="button" aria-pressed={status==='pending'} onClick={()=>onChange({status:'pending'})}>{t('待回复','Awaiting reply')}</button><button type="button" aria-pressed={!status} onClick={()=>onChange({status:''})}>{t('全部','All')}</button></div><button type="button" className="inbox-filter-toggle" aria-expanded={advanced} onClick={()=>setAdvanced(v=>!v)}><InboxIcon name="filter"/>{t('更多筛选','More filters')}</button></div>
  <div className="inbox-advanced-filters" aria-label={t('高级筛选','Advanced filters')} hidden={!advanced}>
   <label>{t('处理状态','Processing status')}<select aria-label={t('处理状态','Processing status')} value={status} onChange={e=>onChange({status:e.target.value})}><option value="">{t('全部状态','All statuses')}</option><option value="pending">{t('待处理','Pending')}</option><option value="in_progress">{t('处理中','In progress')}</option><option value="resolved">{t('已解决','Resolved')}</option></select></label>
   <label>{t('已读状态','Read status')}<select aria-label={t('已读状态','Read status')} value={unread} onChange={e=>onChange({unread:e.target.value})}><option value="">{t('全部已读状态','All read states')}</option><option value="true">{t('未读','Unread')}</option><option value="false">{t('已读','Read')}</option></select></label>
   <label>{t('时间范围','Time range')}<select aria-label={t('时间范围','Time range')} value={from} onChange={e=>onChange({from:e.target.value})}><option value="">{t('全部时间','All time')}</option>{[1,7,30,90].map(d=><option key={d} value={String(d)}>{t(`最近 ${d} 天`,`Last ${d} days`)}</option>)}</select></label>
   <label>{t('标签筛选','Filter by label')}<select aria-label={t('标签筛选','Filter by label')} value={tagIds[0]??''} onChange={e=>onChange({tagIds:e.target.value?[e.target.value]:[]})}><option value="">{t('全部标签','All labels')}</option>{tags.map(tag=><option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
   <label className="inbox-check"><input type="checkbox" checked={searchMessages} onChange={e=>onChange({searchMessages:e.target.checked})}/>{t('同时搜索已同步的消息正文','Also search synchronized message text')}</label>
  </div>
 </div>;
}
