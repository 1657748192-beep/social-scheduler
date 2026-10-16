'use client';
import React,{useEffect,useRef,useState} from 'react';
import type {Workspace} from '../../lib/api';
import {UploadHttpError} from '../../lib/api';
import {getActiveWorkspaceId,setActiveWorkspaceId} from '../../lib/activeWorkspace';
import {loadFacebookDirectory,facebookPageRequest,facebookInteractionKey,newFacebookRequestKey,facebookManagementSendNotice,type FacebookInteractionContext,type FacebookManagedPage,type FacebookReadPage,type FacebookCapabilities,type FacebookSendOutcome} from '../../lib/facebookManagement';
import type {FacebookConversation,FacebookMessage} from '../../lib/facebookEngagement';
import {useLanguage} from '../LanguageProvider';
import {FacebookEngagementStatus} from '../social/FacebookEngagementStatus';
import {useFacebookScope} from '../facebook/useFacebookScope';
import {FacebookUnknownSend} from '../facebook/FacebookUnknownSend';
import {PlatformLogo} from '../PlatformLogo';
type Props={token:string;workspaces:Workspace[];initialContext?:FacebookInteractionContext};
export function FacebookInbox(props:Props){
  const requested=props.initialContext;
  return <InboxController key={props.token+':'+(requested?[requested.workspaceId,requested.managedPageId,requested.connectionId].join(':'):'default')} {...props}/>;
}
function InboxController({token,workspaces,initialContext}:Props){
  const {t}=useLanguage(),[workspaceId,setWorkspaceId]=useState(()=>getActiveWorkspaceId(workspaces,initialContext?.workspaceId)),[managedPageId,setPageId]=useState('');
  const [directory,setDirectory]=useState<{key:string;items:FacebookManagedPage[]}|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(false);
  const key=token+':'+workspaceId,scope=useFacebookScope(key),proposal=useRef(initialContext);
  const workspace=workspaces.find(w=>w.id===workspaceId);
  const eligible=(directory?.key===key?directory.items:[]).filter(p=>p.publishingAccountId&&p.connectionChoices?.some(c=>c.managedPageId===p.selectedManagedPageId&&c.available));
  const page=eligible.find(p=>p.selectedManagedPageId===managedPageId),selection=page?.connectionChoices?.find(c=>c.managedPageId===managedPageId&&c.available);
  useEffect(()=>{
    const current=scope.capture('directory');setDirectory(null);setPageId('');setError(null);setLoading(true);
    if(!workspaceId){setLoading(false);return;}
    void loadFacebookDirectory(token,workspaceId).then(result=>{
      if(!current())return;setDirectory({key,items:result.items});
      const choices=result.items.flatMap(p=>p.publishingAccountId?(p.connectionChoices??[]).filter(c=>c.available&&c.managedPageId===p.selectedManagedPageId):[]);
      const requested=proposal.current;
      if(requested){const valid=requested.workspaceId===workspaceId&&choices.find(c=>c.managedPageId===requested.managedPageId&&c.connectionId===requested.connectionId);
        if(valid)setPageId(valid.managedPageId);else setError(t('请求的主页或连接不可用，请重新选择。','The requested Page or connection is unavailable. Select one again.'));
      }else setPageId(choices[0]?.managedPageId??'');
    }).catch(e=>{if(current())setError(e instanceof Error?e.message:t('目录读取失败','Directory unavailable'));}).finally(()=>{if(current())setLoading(false);});
  },[token,workspaceId]);
  useEffect(()=>{if(!workspace){setDirectory(null);setPageId('');setWorkspaceId(workspaces[0]?.id??'');}},[workspaces,workspaceId]);
  return <section className="panel facebook-inbox"><div className="facebook-actions"><PlatformLogo platform="facebook"/><h2>{t('Facebook 收件箱','Facebook inbox')}</h2></div>
    <div className="facebook-filters"><label>{t('工作区','Workspace')}<select aria-label={t('工作区','Workspace')} value={workspaceId} onChange={e=>{proposal.current=undefined;setDirectory(null);setPageId('');setError(null);setWorkspaceId(e.target.value);setActiveWorkspaceId(e.target.value);}}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label>{t('公共主页','Page')}<select aria-label={t('公共主页','Page')} value={managedPageId} onChange={e=>{proposal.current=undefined;setPageId(e.target.value);setError(null);}}><option value="">{t('请选择主页','Select a Page')}</option>{eligible.map(p=><option key={p.pageId} value={p.selectedManagedPageId!}>{p.name}</option>)}</select></label></div>
    {loading?<p role="status">{t('正在核验主页目录…','Verifying Page directory…')}</p>:null}{error?<p role="alert" className="error">{error}</p>:null}
    {!loading&&!error&&!eligible.length?<p>{t('暂无已绑定且已明确选择互动授权的主页。请到 BM 主页管理核对；不会自动使用发布凭据。','No publishing-bound Pages have an explicitly selected interaction connection. Check BM management; publishing credentials are never used automatically.')} <a href="/facebook-management">{t('BM 主页管理','BM Page management')}</a></p>:null}
    {page&&selection&&workspace?<PageInbox key={facebookInteractionKey(token,{workspaceId,managedPageId:selection.managedPageId,connectionId:selection.connectionId})} token={token} context={{workspaceId,managedPageId:selection.managedPageId,connectionId:selection.connectionId}} pageName={page.name} role={workspace.role}/>:null}
  </section>;
}
function PageInbox({token,context,pageName,role}:{token:string;context:FacebookInteractionContext;pageName:string;role:Workspace['role']}){
  const {t}=useLanguage(),scope=useFacebookScope(facebookInteractionKey(token,context));
  const [rows,setRows]=useState<FacebookConversation[]>([]),[conversationId,setConversationId]=useState(''),[cursor,setCursor]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0),[capabilities,setCapabilities]=useState<FacebookCapabilities|null>(null),[readAt,setReadAt]=useState('');
  async function read(after?:string){
    if(!scope.alive())return;const current=scope.capture('conversations');setLoading(true);
    try{const result=await facebookPageRequest<FacebookReadPage<FacebookConversation>>(token,context,'/conversations'+(after?'?cursor='+encodeURIComponent(after):''));if(!current())return;if(!Array.isArray(result.items))throw Error(t('会话响应不可用','Conversation response unavailable'));
      setRows(previous=>after?[...new Map([...previous,...result.items].map(c=>[c.id,c])).values()]:result.items);setCursor(result.nextCursor);setReadAt(result.readAt);setLoaded(true);setError(null);
      if(!after)setConversationId(previous=>result.items.some(c=>c.id===previous)?previous:result.items[0]?.id??'');
    }catch(e){if(current())setError(e instanceof Error?e.message:t('会话读取失败，保留上次数据。','Conversations unavailable; keeping previous data.'));}
    finally{if(current())setLoading(false);}
  }
  function refresh(){if(!scope.alive())return;void read();setRevision(value=>value+1);}
  useEffect(()=>{void read();const timer=window.setInterval(()=>{if(scope.alive()&&document.visibilityState==='visible')refresh();},30000);return()=>window.clearInterval(timer);},[]);
  const conversation=rows.find(c=>c.id===conversationId);
  return <div><FacebookEngagementStatus token={token} {...context} canManage={role==='owner'||role==='admin'} onCapabilities={setCapabilities}/>
    <div className="facebook-actions"><strong>{pageName}</strong><button type="button" className="secondary" disabled={loading} onClick={refresh}>{t('刷新','Refresh')}</button></div>
    {error?<p role="alert" className="error">{error}</p>:null}
    <div className="facebook-inbox-columns"><section><h3>{t('会话','Conversations')}</h3>{rows.map(item=><button type="button" className="facebook-conversation-button secondary" key={item.id} aria-pressed={item.id===conversationId} onClick={()=>setConversationId(item.id)}>{item.counterpartyName??t('客户','Customer')} · {item.counterpartyId}</button>)}
      {loaded&&!rows.length&&!error?<p>{t('当前 API 可见范围内暂无会话。','No conversations are visible through the API.')}</p>:null}{cursor?<button type="button" disabled={loading} onClick={()=>void read(cursor)}>{t('更多会话','More conversations')}</button>:null}
      {readAt?<small>{t('会话读取：','Conversations read: ')}<time dateTime={readAt}>{new Date(readAt).toLocaleString()}</time></small>:null}</section>
      <section>{conversation?<ConversationMessages key={facebookInteractionKey(token,context)+':'+conversation.id} token={token} context={context} conversation={conversation} pageName={pageName} role={role} capabilities={capabilities} revision={revision}/>:<p>{t('请选择一个可见会话。','Select a visible conversation.')}</p>}</section>
    </div>
  </div>;
}
function ConversationMessages({token,context,conversation,pageName,role,capabilities,revision}:{token:string;context:FacebookInteractionContext;conversation:FacebookConversation;pageName:string;role:Workspace['role'];capabilities:FacebookCapabilities|null;revision:number}){
  const {t,locale}=useLanguage(),scope=useFacebookScope(facebookInteractionKey(token,context)+':'+conversation.id);
  const [items,setItems]=useState<FacebookMessage[]>([]),[cursor,setCursor]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[readAt,setReadAt]=useState(''),[error,setError]=useState<string|null>(null),[draft,setDraft]=useState(''),[sending,setSending]=useState(false),[unknown,setUnknown]=useState(false),[notice,setNotice]=useState('');
  async function read(after?:string){
    if(!scope.alive())return;const current=scope.capture('messages');
    try{const result=await facebookPageRequest<FacebookReadPage<FacebookMessage>>(token,context,'/conversations/'+encodeURIComponent(conversation.id)+'/messages'+(after?'?cursor='+encodeURIComponent(after):''));if(!current())return;if(!Array.isArray(result.items))throw Error(t('消息响应不可用','Message response unavailable'));
      setItems(previous=>after?[...new Map([...previous,...result.items].map(m=>[m.id,m])).values()]:result.items);setCursor(result.nextCursor);setReadAt(result.readAt);setLoaded(true);setError(null);
    }catch(e){if(current())setError(e instanceof Error?e.message:t('消息读取失败，保留上次数据。','Messages unavailable; keeping previous data.'));}
  }
  useEffect(()=>{void read();},[revision]);
  const times=items.filter(m=>m.inbound&&m.senderId===conversation.counterpartyId).map(m=>Date.parse(m.timestamp)).filter(time=>Number.isFinite(time)&&time<=Date.now());
  const latest=times.length?Math.max(...times):null,windowOpen=latest!==null&&Date.now()-latest<86400000;
  const canSend=role!=='viewer'&&capabilities?.readMessages.status==='available'&&capabilities?.replyMessages.status==='available'&&windowOpen;
  async function send(){
    if(!canSend||!draft.trim()||unknown)return;const operation=scope.beginSend();if(!operation)return;const text=draft;setSending(true);setError(null);
    try{
      const requestKey=newFacebookRequestKey();let result:FacebookSendOutcome;
      try{result=await facebookPageRequest<FacebookSendOutcome>(token,context,'/conversations/'+encodeURIComponent(conversation.id)+'/replies',{body:{text,requestKey}});}
      catch(e){result=e instanceof UploadHttpError&&[400,401,403,404,409].includes(e.status)?{status:'failed',code:'request_rejected',diagnosticId:'client-rejection'}:{status:'unknown',diagnosticId:'client-uncertain'};}
      if(!operation.current())return;setNotice(facebookManagementSendNotice(result,locale==='en'));if(result.status==='sent'){setDraft('');void read();}else if(result.status==='unknown')setUnknown(true);
    }catch{if(operation.current())setError(t('无法创建安全请求，请使用 HTTPS 浏览器重试。','Could not create a secure request. Use an HTTPS browser.'));}
    finally{if(operation.current())setSending(false);operation.end();}
  }
  return <div className="facebook-messages"><h3>{t('消息','Messages')}</h3><p>{t('回复身份：','Reply as: ')}<strong>{pageName}</strong> · {t('目标：','Recipient: ')}{conversation.counterpartyName??t('客户','Customer')} ({conversation.counterpartyId})</p>
    {error?<p role="alert" className="error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {items.map(item=><article key={item.id} className="facebook-message"><strong>{item.inbound?t('客户','Customer'):t('主页回复','Page reply')}</strong><p>{item.text||t('非文字消息，请到官方后台查看。','Non-text message. View it in the official inbox.')}</p><small>{new Date(item.timestamp).toLocaleString(locale==='en'?'en-US':'zh-CN')}</small></article>)}
    {loaded&&!items.length&&!error?<p>{t('当前 API 可见范围内暂无消息。','No messages are visible through the API.')}</p>:null}
    {cursor?<button type="button" className="secondary" onClick={()=>void read(cursor)}>{t('更多消息','More messages')}</button>:null}
    {readAt?<p className="muted">{t('读取时间：','Read at: ')}<time dateTime={readAt}>{new Date(readAt).toLocaleString(locale==='en'?'en-US':'zh-CN')}</time></p>:null}
    {role==='viewer'?<p>{t('当前角色只可查看消息。','Your role is read-only.')}</p>:<><textarea aria-label={t('回复内容','Reply text')} value={draft} maxLength={2000} disabled={sending||unknown||!canSend} onChange={e=>setDraft(e.target.value)}/><button type="button" disabled={sending||unknown||!canSend||!draft.trim()} onClick={()=>void send()}>{t('发送','Send')}</button></>}
    {unknown?<FacebookUnknownSend onNewReply={()=>{setUnknown(false);setNotice('');}}/>:null}
    {!windowOpen?<p>{t('标准 24 小时窗口已关闭或无法核验，请到官方后台核对。','The standard 24-hour window is closed or unverified. Check the official inbox.')}</p>:null}
    <p className="muted">{t('仅支持客户主动联系后的标准 24 小时人工回复，发送前服务器再次核验。','Only manual replies within 24 hours of a customer message are supported. The server verifies again before sending.')} <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">{t('Meta Business Suite ↗','Meta Business Suite ↗')}</a></p>
  </div>;
}
