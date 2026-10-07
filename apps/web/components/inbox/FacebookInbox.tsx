'use client';
import React,{useEffect,useRef,useState} from 'react';
import { apiRequest,type Workspace,type SocialAccount } from '../../lib/api';
import { getActiveWorkspaceId,setActiveWorkspaceId } from '../../lib/activeWorkspace';
import { createFacebookRequestGuard,facebookAccountPath,facebookSendNotice,type FacebookConversation,type FacebookMessage,type FacebookPage,type FacebookSendResult } from '../../lib/facebookEngagement';
import { useLanguage } from '../LanguageProvider';
import { FacebookEngagementStatus } from '../social/FacebookEngagementStatus';
import { PlatformLogo } from '../PlatformLogo';
export function FacebookInbox({token,workspaces}:{token:string;workspaces:Workspace[]}){
  const {t,locale}=useLanguage();
  const [workspaceId,setWorkspaceId]=useState(()=>getActiveWorkspaceId(workspaces,'')),[accounts,setAccounts]=useState<SocialAccount[]>([]),[accountId,setAccountId]=useState('');
  const [conversations,setConversations]=useState<FacebookConversation[]>([]),[conversationId,setConversationId]=useState(''),[messages,setMessages]=useState<FacebookMessage[]>([]);
  const [conversationCursor,setConversationCursor]=useState<string|null>(null),[messageCursor,setMessageCursor]=useState<string|null>(null),[draft,setDraft]=useState('');
  const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[sending,setSending]=useState(false),[readAt,setReadAt]=useState('');
  const guard=useRef(createFacebookRequestGuard());guard.current.reset(`${token}:${workspaceId}:${accountId}:${conversationId}`);
  const accountGuard=useRef(createFacebookRequestGuard());accountGuard.current.reset(`${token}:${workspaceId}`);
  const conversationGuard=useRef(createFacebookRequestGuard());conversationGuard.current.reset(`${token}:${workspaceId}:${accountId}`);
  const workspace=workspaces.find(value=>value.id===workspaceId),base=facebookAccountPath(workspaceId,accountId);
  useEffect(()=>{setWorkspaceId(current=>getActiveWorkspaceId(workspaces,current));},[workspaces]);
  useEffect(()=>{
    setAccounts([]);setAccountId('');setConversations([]);setConversationId('');setMessages([]);setError(null);setNotice('');setDraft('');setReadAt('');
    if(!workspaceId)return;
    void accountGuard.current.run('accounts',()=>apiRequest<SocialAccount[]>(`/workspaces/${encodeURIComponent(workspaceId)}/social-accounts`,{token}))
      .then(result=>{if(result.current){const values=result.value.filter(account=>account.platform==='facebook' && account.accountType==='page' && account.status==='active');setAccounts(values);setAccountId(values[0]?.id??'');}})
      .catch(e=>setError(e instanceof Error?e.message:t('账号读取失败','Unable to read accounts')));
  },[workspaceId,token]);
  async function readConversations(after?:string){
    if(!accountId)return;setLoading(true);
    try{const result=await conversationGuard.current.run('conversations',()=>apiRequest<FacebookPage<FacebookConversation>>(base+'/conversations'+(after?'?after='+encodeURIComponent(after):''),{token}));
      if(result.current){setConversations(current=>after?[...current,...result.value.items]:result.value.items);setConversationCursor(result.value.nextCursor);if(!after)setConversationId(current=>result.value.items.some(item=>item.id===current)?current:result.value.items[0]?.id??'');setError(null);}}
    catch(e){setError(e instanceof Error?e.message:t('会话读取失败，保留上次数据。','Conversations unavailable; keeping previous data.'));}finally{setLoading(false);}
  }
  async function readMessages(after?:string){
    if(!accountId || !conversationId)return;
    try{const result=await guard.current.run('messages',()=>apiRequest<FacebookPage<FacebookMessage>>(`${base}/conversations/${encodeURIComponent(conversationId)}/messages`+(after?'?after='+encodeURIComponent(after):''),{token}));
      if(result.current){setMessages(current=>after?[...current,...result.value.items]:result.value.items);setMessageCursor(result.value.nextCursor);setReadAt(new Date().toLocaleString(locale,{timeZone:'Asia/Shanghai'}));setError(null);}}
    catch(e){setError(e instanceof Error?e.message:t('消息读取失败，保留上次数据。','Messages unavailable; keeping previous data.'));}
  }
  useEffect(()=>{setConversations([]);setConversationId('');setMessages([]);setDraft('');setNotice('');setError(null);setConversationCursor(null);setMessageCursor(null);void readConversations();},[accountId]);
  useEffect(()=>{setMessages([]);setDraft('');setNotice('');setMessageCursor(null);setReadAt('');void readMessages();},[conversationId]);
  useEffect(()=>{if(!accountId)return;const timer=window.setInterval(()=>{if(document.visibilityState==='visible' && !sending){void readConversations();void readMessages();}},30000);return()=>window.clearInterval(timer);},[accountId,conversationId,token,sending]);
  async function send(){
    if(!draft.trim() || sending)return;setSending(true);
    try{const result=await guard.current.send(()=>apiRequest<FacebookSendResult>(`${base}/conversations/${encodeURIComponent(conversationId)}/replies`,{token,method:'POST',body:{text:draft}}));
      if(result.current){setNotice(facebookSendNotice(result.value,locale));if(result.value.status==='sent'){setDraft('');void readMessages();}}}
    catch(e){setError(e instanceof Error?e.message:t('回复失败','Reply failed'));}finally{setSending(false);}
  }
  return <section className="panel"><div className="button-row"><PlatformLogo platform="facebook"/><h2>{t('Facebook 收件箱','Facebook inbox')}</h2></div>
    <div className="button-row"><label>{t('工作区','Workspace')}<select value={workspaceId} onChange={e=>{guard.current.reset('switch-workspace');setWorkspaceId(e.target.value);setActiveWorkspaceId(e.target.value);}}>{workspaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>{t('公共主页','Page')}<select value={accountId} onChange={e=>{guard.current.reset('switch-account');setAccountId(e.target.value);}}><option value="">{t('请选择主页','Select a Page')}</option>{accounts.map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      <button type="button" className="button secondary" disabled={!accountId||loading} onClick={()=>{void readConversations();void readMessages();}}>{t('刷新','Refresh')}</button></div>
    {!accounts.length?<p className="muted">{t('暂无已连接的 Facebook 公共主页，请到社交账号页绑定。','No connected Facebook Pages. Connect one on Social accounts.')}</p>:null}
    {accountId?<FacebookEngagementStatus key={`${workspaceId}:${accountId}`} token={token} workspaceId={workspaceId} socialAccountId={accountId} canManage={workspace?.role==='owner'||workspace?.role==='admin'}/>:null}
    {error?<p role="alert" className="error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    <div style={{display:'grid',gridTemplateColumns:'minmax(180px,1fr) minmax(0,2fr)',gap:16,marginTop:16}}>
      <section><h3>{t('会话','Conversations')}</h3>{conversations.map(item=><button type="button" className="button secondary" style={{display:'block',marginBottom:8,width:'100%'}} aria-pressed={item.id===conversationId} key={item.id} onClick={()=>{guard.current.reset('switch-conversation');setConversationId(item.id);}}>{item.counterpartyName??t('客户','Customer')} · {item.counterpartyId}</button>)}
        {conversationCursor?<button type="button" disabled={loading} onClick={()=>void readConversations(conversationCursor)}>{t('更多会话','More conversations')}</button>:null}</section>
      <section><h3>{t('消息','Messages')}</h3>{messages.map(item=><article key={item.id} className="instagram-message"><strong>{item.inbound?t('客户','Customer'):t('主页回复','Page reply')}</strong><p>{item.text||t('非文字消息，请到官方收件箱查看。','Non-text message; view it in the official inbox.')}</p><small>{new Date(item.timestamp).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</small></article>)}
        {messageCursor?<button type="button" onClick={()=>void readMessages(messageCursor)}>{t('更多消息','More messages')}</button>:null}
        {readAt?<p className="muted">{t('读取时间：','Read at: ')}{readAt}</p>:null}
        {workspace?.role==='viewer'?<p className="muted">{t('当前角色只可查看消息。','Your role is read-only.')}</p>:<><textarea aria-label={t('回复内容','Reply text')} value={draft} maxLength={2000} disabled={!conversationId||sending} onChange={e=>setDraft(e.target.value)}/><button type="button" className="button" disabled={!conversationId||!draft.trim()||sending} onClick={()=>void send()}>{t('发送','Send')}</button></>}
        <p className="muted">{t('仅支持客户主动发起消息后的标准 24 小时人工回复，服务器会再次核验。','Manual replies are limited to the standard 24-hour window after a customer message; the server verifies it again.')}</p></section></div>
  </section>;
}
