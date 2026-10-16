'use client';
import React,{useEffect,useState} from 'react';
import {UploadHttpError} from '../../lib/api';
import {facebookPageRequest,facebookInteractionKey,newFacebookRequestKey,facebookManagementSendNotice,type FacebookInteractionContext,type FacebookCapabilities,type FacebookReadPage,type FacebookSendOutcome} from '../../lib/facebookManagement';
import type {FacebookComment} from '../../lib/facebookEngagement';
import {useLanguage} from '../LanguageProvider';
import {useFacebookScope} from '../facebook/useFacebookScope';
import {FacebookUnknownSend} from '../facebook/FacebookUnknownSend';
import {FacebookEngagementStatus} from '../social/FacebookEngagementStatus';
type ViewProps={items:FacebookComment[];missingPostId:boolean;canReply:boolean;error:string|null;busy:boolean;drafts:Record<string,string>;onDraft(id:string,text:string):void;onReply(id:string):void;onRefresh():void;loaded?:boolean;reading?:boolean;canRead?:boolean;pageName?:string;locked?:boolean};
export function FacebookCommentsView({items,missingPostId,canReply,error,busy,drafts,onDraft,onReply,onRefresh,loaded=false,reading=false,canRead=true,pageName,locked=false}:ViewProps){
  const {t,locale}=useLanguage();
  return <section className="facebook-comments-view"><div className="facebook-actions"><strong>{t('Facebook 帖子评论','Facebook post comments')}</strong><button type="button" className="secondary" disabled={reading||missingPostId||!canRead} onClick={onRefresh}>{t('读取评论','Read comments')}</button></div>
    {pageName?<p>{t('回复身份：','Reply as: ')}<strong>{pageName}</strong></p>:null}
    {error?<p className="error" role="alert">{error}</p>:null}
    {missingPostId?<p>{t('真实帖子 ID 不可用，无法读取或回复评论。','The real post ID is unavailable; comments cannot be read or replied to.')}</p>:!canRead?<p>{t('评论读取尚未获准或无法核验，请到 BM 管理检查。','Comment access is missing or unverified. Check BM management.')}</p>:!items.length&&!error?<p>{loaded?t('当前 API 可见范围内暂无评论。','No comments are visible through the API.'):t('尚未读取评论。','Comments have not been read yet.')}</p>:null}
    {items.map(comment=><article key={comment.id} className="facebook-comment"><strong>{comment.senderName??t('客户','Customer')}</strong><p>{comment.text||t('非文字评论','Non-text comment')}</p><small>{new Date(comment.timestamp).toLocaleString(locale==='en'?'en-US':'zh-CN')}</small>
      {canReply?<div className="facebook-comment-reply"><label>{t('回复目标：','Reply target: ')}{comment.senderName??comment.id}<textarea aria-label={t('回复评论 ','Comment reply ')+comment.id} value={drafts[comment.id]??''} maxLength={8000} disabled={busy||locked} onChange={e=>onDraft(comment.id,e.target.value)}/></label><button type="button" disabled={busy||locked||!(drafts[comment.id]??'').trim()} onClick={()=>onReply(comment.id)}>{t('发送回复','Send reply')}</button></div>:null}
    </article>)}
  </section>;
}
type Props=FacebookInteractionContext&{token:string;scheduleId:string;providerPostId?:string|null;role?:string;pageName?:string};
export function FacebookPostComments(props:Props){return <CommentController key={facebookInteractionKey(props.token,props)+':'+props.scheduleId+':'+props.providerPostId} {...props}/>;}
function CommentController({token,scheduleId,providerPostId,role='viewer',pageName,...context}:Props){
  const {t,locale}=useLanguage(),scope=useFacebookScope(facebookInteractionKey(token,context)+':'+scheduleId);
  const [expanded,setExpanded]=useState(false),[items,setItems]=useState<FacebookComment[]>([]),[cursor,setCursor]=useState<string|null>(null),[drafts,setDrafts]=useState<Record<string,string>>({}),[reading,setReading]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState(''),[readAt,setReadAt]=useState(''),[loaded,setLoaded]=useState(false),[capabilities,setCapabilities]=useState<FacebookCapabilities|null>(null),[unknown,setUnknown]=useState(false);
  const canRead=Boolean(providerPostId)&&capabilities?.readComments.status==='available';
  const canReply=canRead&&['owner','admin','editor'].includes(role)&&capabilities?.replyComments.status==='available';
  const base='/posts/'+encodeURIComponent(scheduleId)+'/comments';
  async function read(after?:string){
    if(!scope.alive()||!canRead)return;const current=scope.capture('comments');setReading(true);
    try{const result=await facebookPageRequest<FacebookReadPage<FacebookComment>>(token,context,base+(after?'?cursor='+encodeURIComponent(after):''));if(!current())return;if(!Array.isArray(result.items))throw Error(t('评论响应不可用','Comment response unavailable'));
      setItems(previous=>after?[...new Map([...previous,...result.items].map(comment=>[comment.id,comment])).values()]:result.items);setCursor(result.nextCursor);setReadAt(result.readAt);setLoaded(true);setError(null);
    }catch(e){if(current())setError(e instanceof Error?e.message:t('评论读取失败，保留上次数据。','Comments unavailable; keeping previous data.'));}
    finally{if(current())setReading(false);}
  }
  useEffect(()=>{
    if(!expanded||!canRead)return;void read();
    const timer=window.setInterval(()=>{if(scope.alive()&&document.visibilityState==='visible')void read();},30000);
    return()=>window.clearInterval(timer);
  },[expanded,canRead]);
  async function reply(id:string){
    const text=drafts[id]??'';if(!canReply||!text.trim()||unknown)return;const operation=scope.beginSend();if(!operation)return;setSending(true);setError(null);
    try{const requestKey=newFacebookRequestKey();let result:FacebookSendOutcome;
      try{result=await facebookPageRequest<FacebookSendOutcome>(token,context,base+'/'+encodeURIComponent(id)+'/replies',{body:{text,requestKey}});}
      catch(e){result=e instanceof UploadHttpError&&[400,401,403,404,409].includes(e.status)?{status:'failed',code:'request_rejected',diagnosticId:'client-rejection'}:{status:'unknown',diagnosticId:'client-uncertain'};}
      if(!operation.current())return;setNotice(facebookManagementSendNotice(result,locale==='en'));if(result.status==='sent'){setDrafts(previous=>({...previous,[id]:''}));void read();}else if(result.status==='unknown')setUnknown(true);
    }catch{if(operation.current())setError(t('无法创建安全请求，请使用 HTTPS 浏览器重试。','Could not create a secure request. Use an HTTPS browser.'));}
    finally{if(operation.current())setSending(false);operation.end();}
  }
  return <div className="facebook-post-comments"><button type="button" className="secondary" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{t('Facebook 评论','Facebook comments')}</button>
    {expanded?<><FacebookEngagementStatus token={token} {...context} canManage={role==='owner'||role==='admin'} onCapabilities={setCapabilities}/>
      <FacebookCommentsView items={items} missingPostId={!providerPostId} canRead={canRead} canReply={canReply} error={error} busy={sending} reading={reading} loaded={loaded} drafts={drafts} pageName={pageName} locked={unknown} onDraft={(id,text)=>setDrafts(previous=>({...previous,[id]:text}))} onReply={id=>void reply(id)} onRefresh={()=>void read()}/>
      {notice?<p role="status">{notice}</p>:null}{unknown?<FacebookUnknownSend onNewReply={()=>{setUnknown(false);setNotice('');}}/>:null}
      {readAt?<p className="muted">{t('读取时间：','Read at: ')}<time dateTime={readAt}>{new Date(readAt).toLocaleString(locale==='en'?'en-US':'zh-CN')}</time></p>:null}
      {cursor?<button type="button" className="secondary" disabled={reading} onClick={()=>void read(cursor)}>{t('更多评论','More comments')}</button>:null}
      <p className="muted">{t('只支持人工公开回复本软件已核验的发布记录。','Only manual public replies on verified software publishing records are supported.')} <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">{t('Meta Business Suite ↗','Meta Business Suite ↗')}</a></p>
    </>:null}
  </div>;
}
