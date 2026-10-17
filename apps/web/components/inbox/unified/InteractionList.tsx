'use client';
import React,{type ReactNode} from 'react';
import {useLanguage} from '../../LanguageProvider';
import type {InboxCase} from '../../../lib/interactionInbox';
import {InboxIcon,inboxInitials} from './InboxIcon';
export function InteractionList({items,activeId,onSelect,loading,failed,hasMore,onMore,checkedIds=[],onCheck,toolbar}:{items:InboxCase[];activeId:string|null;onSelect:(c:InboxCase)=>void;loading:boolean;failed:boolean;hasMore:boolean;onMore:()=>void;checkedIds?:string[];onCheck?:(id:string)=>void;toolbar?:ReactNode}){
 const {t}=useLanguage();
 return <section className="inbox-list" aria-label={t('互动列表','Interactions')}>
  {toolbar}{loading?<p role="status" className="inbox-list-notice">{t('正在读取互动…','Loading interactions…')}</p>:null}
  {!loading&&!items.length?<div className="inbox-list-empty"><InboxIcon name="message"/><p>{failed?t('当前读取不完整，请重试；不能认定为没有消息。','Reads are incomplete. Retry; this does not mean there are no messages.'):t('当前筛选下暂无已同步互动。','No synchronized interactions match this filter.')}</p></div>:null}
  {items.map(c=><div className="inbox-case-entry" key={c.id} data-active={activeId===c.id}>{onCheck?<label className="inbox-case-check"><input type="checkbox" aria-label={t(`选择互动 ${c.customerName??'匿名参与者'}`,`Select interaction ${c.customerName??'anonymous'}`)} checked={checkedIds.includes(c.id)} disabled={checkedIds.length>=50&&!checkedIds.includes(c.id)} onChange={()=>onCheck(c.id)}/></label>:null}
   <button type="button" className="inbox-case-row" aria-current={activeId===c.id?'true':undefined} onClick={()=>onSelect(c)}><span className="inbox-avatar" aria-hidden="true">{inboxInitials(c.customerName)}</span><span className="inbox-case-summary"><span className="inbox-case-title"><strong>{c.customerName??t('匿名参与者','Anonymous participant')}</strong>{c.unread?<span className="inbox-unread-dot" aria-label={t('未读','Unread')}/>:null}</span><span className="inbox-case-state">{c.kind==='comments'?t('评论','Comment'):c.kind==='messages'?t('私信','Message'):t('提及','Mention')} · {c.status==='resolved'?t('已解决','Resolved'):c.status==='in_progress'?t('处理中','In progress'):t('待回复','Awaiting reply')}</span><small className="inbox-case-source">{c.sourceLabel}</small><time>{c.lastInboundAt?new Date(c.lastInboundAt).toLocaleString():t('平台未提供时间','Timestamp unavailable')}</time>{c.tags.length?<span className="inbox-row-tags">{c.tags.map(tag=><span key={tag.id} className="inbox-label" data-color={tag.color}>{tag.name}</span>)}</span>:null}</span></button></div>)}
  {hasMore?<button type="button" className="button secondary inbox-load-more" disabled={loading} onClick={onMore}>{t('加载更多互动','Load more interactions')}</button>:null}<p className="inbox-list-footnote">{t('仅显示已同步且有权访问的互动','Only synchronized, accessible interactions are shown')}</p>
 </section>;
}
