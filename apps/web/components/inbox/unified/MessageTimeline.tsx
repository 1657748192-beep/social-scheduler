'use client';
import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useLanguage} from '../../LanguageProvider';import type {InboxDetail} from '../../../lib/interactionInbox';
import {InboxAvatar} from './InboxAvatar';import {chronologicalMessages} from './messageHistory';
type Position={top:number;height:number;nearBottom:boolean;anchorId:string|null;anchorOffset:number;firstId:string|null};
export function MessageTimeline({items,customerName,accountName,nextCursor,busy,onMore}:{items:InboxDetail['items'];customerName:string;accountName:string;nextCursor:string|null;busy:boolean;onMore:()=>void}){
 const {t,locale}=useLanguage(),ordered=useMemo(()=>chronologicalMessages(items),[items]);
 const viewport=useRef<HTMLDivElement>(null),position=useRef<Position|null>(null),[atBottom,setAtBottom]=useState(true);
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone,language=locale==='en'?'en-GB':'zh-CN';
 function capture():Position|null{
  const node=viewport.current;if(!node)return null;const top=node.getBoundingClientRect().top;
  const anchor=Array.from(node.querySelectorAll<HTMLElement>('[data-message-id]')).find(row=>row.getBoundingClientRect().bottom>top);
  return{top:node.scrollTop,height:node.scrollHeight,nearBottom:node.scrollHeight-node.clientHeight-node.scrollTop<=64,anchorId:anchor?.dataset.messageId??null,anchorOffset:anchor?anchor.getBoundingClientRect().top-top:0,firstId:ordered[0]?.id??null};
 }
 function remember(){const current=capture();if(current){position.current=current;setAtBottom(current.nearBottom);}}
 function latest(){const node=viewport.current;if(node){node.scrollTop=node.scrollHeight;remember();}}
 useLayoutEffect(()=>{
  const node=viewport.current;if(!node||!ordered.length)return;
  const previous=position.current,prepend=previous?.firstId&&ordered.findIndex(item=>item.id===previous.firstId)>0;
  if(!previous||previous.nearBottom&&!prepend)node.scrollTop=node.scrollHeight;
  else{
   const anchor=Array.from(node.querySelectorAll<HTMLElement>('[data-message-id]')).find(row=>row.dataset.messageId===previous.anchorId);
   node.scrollTop=anchor?node.scrollTop+anchor.getBoundingClientRect().top-node.getBoundingClientRect().top-previous.anchorOffset:previous.top+(prepend?node.scrollHeight-previous.height:0);
  }
  remember();
 },[ordered,locale]);
 let lastDay='';
 return <div className="inbox-chat">
  <div className="inbox-chat-toolbar"><small>{t('本机时间','Local time')} · {zone}</small>{nextCursor?<button type="button" className="button secondary inbox-context-more" disabled={busy} onClick={onMore}>{busy?t('正在加载…','Loading…'):t('加载更早消息','Load earlier messages')}</button>:null}</div>
  <div ref={viewport} className="inbox-chat-timeline" role="log" aria-label={t('私信对话','Private message conversation')} aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={remember}>
   {!ordered.length?<p className="inbox-context-notice">{t('尚未读取到可显示的原文；不会用其他客户的内容代替。','No displayable source content has been loaded; other customers’ content is not substituted.')}</p>:null}
   {ordered.map(item=>{
    const date=new Date(item.occurredAt),valid=Number.isFinite(date.getTime()),day=valid?date.toLocaleDateString(language,{year:'numeric',month:'2-digit',day:'2-digit'}):t('时间未知','Unknown time'),separator=day!==lastDay;lastDay=day;
    return <React.Fragment key={item.id}>{separator?<div className="inbox-chat-date">{day}</div>:null}<article className="inbox-message" data-message-id={item.id} data-inbound={item.inbound}>
     <InboxAvatar name={item.senderName??(item.inbound?customerName:accountName)} url={item.senderAvatarUrl}/>
     <div className="inbox-message-body"><div className="inbox-message-meta"><strong>{item.senderName??(item.inbound?customerName:accountName)}</strong>{!item.inbound?<small>{t('主页回复','Page reply')}</small>:null}</div>
      <p>{item.deleted?t('此内容已删除','This content was deleted'):item.text??t('平台未提供可显示的文字','No displayable text provided')}</p>
      <time className="inbox-chat-time" dateTime={valid?item.occurredAt:undefined} title={valid?date.toLocaleString(language,{timeZoneName:'short'}):day}>{valid?date.toLocaleTimeString(language,{hour:'2-digit',minute:'2-digit',hour12:false}):day}</time>
     </div>
    </article></React.Fragment>;
   })}
  </div>
  {!atBottom?<button className="button secondary inbox-chat-latest" type="button" onClick={latest}>{t('回到最新消息','Jump to latest')}</button>:null}
 </div>;
}
