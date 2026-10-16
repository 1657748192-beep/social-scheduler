'use client';
import {useEffect,useRef,useState} from 'react';
import type {Workspace} from '../../lib/api';
import {getActiveWorkspaceId,setActiveWorkspaceId} from '../../lib/activeWorkspace';
import {facebookManagementRequest,loadFacebookDirectory,safeFacebookAvatarUrl,safeFacebookProfileUrl,type FacebookConnection,type FacebookManagedPage,type FacebookReadPage} from '../../lib/facebookManagement';
import {useLanguage} from '../LanguageProvider';
import {FacebookConnectionStatus} from './FacebookConnectionStatus';

type Snapshot={key:string;connections:FacebookConnection[];directory:FacebookReadPage<FacebookManagedPage>};
export function FacebookManagementPanel({token,workspaces}:{token:string;workspaces:Workspace[]}){
  const {t,locale}=useLanguage();
  const [workspaceId,setWorkspaceId]=useState(()=>getActiveWorkspaceId(workspaces));
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[enabled,setEnabled]=useState<boolean|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState('');
  const [business,setBusiness]=useState(''),[connectionFilter,setConnectionFilter]=useState(''),[query,setQuery]=useState('');
  const [dialog,setDialog]=useState<{kind:'connect'|'disconnect';connectionId?:string}|null>(null);
  const generation=useRef(0),pending=useRef<string|null>(null),key=`${token}:${workspaceId}`;
  const workspace=workspaces.find(w=>w.id===workspaceId),manager=workspace?.role==='owner'||workspace?.role==='admin';
  const visible=snapshot?.key===key?snapshot:null;
  async function read(workspace:string,signal?:AbortSignal){
    const [connections,directory]=await Promise.all([facebookManagementRequest<FacebookConnection[]>(token,workspace,'/connections',{signal}),loadFacebookDirectory(token,workspace,signal)]);
    return {key:`${token}:${workspace}`,connections,directory};
  }
  useEffect(()=>{
    const id=++generation.current,controller=new AbortController();setSnapshot(null);setEnabled(null);setError(null);setBusy('load');setDialog(null);pending.current=null;
    setBusiness('');setConnectionFilter('');setQuery('');
    if(!workspaceId){setBusy('');return()=>{generation.current++;controller.abort();};}
    void (async()=>{
      try{const status=await facebookManagementRequest<{enabled:boolean;configured:boolean}>(token,workspaceId,'/status',{signal:controller.signal});if(id!==generation.current)return;
        setEnabled(status.enabled===true&&status.configured===true);
        if(status.enabled&&status.configured){const next=await read(workspaceId,controller.signal);if(id===generation.current)setSnapshot(next);}
      }catch(requestError){if(id===generation.current)setError(requestError instanceof Error?requestError.message:t('无法读取管理目录','Could not read management directory'));}
      finally{if(id===generation.current)setBusy('');}
    })();
    return()=>{generation.current++;controller.abort();};
  },[token,workspaceId]);
  useEffect(()=>{if(!workspaces.some(w=>w.id===workspaceId)){generation.current++;setSnapshot(null);setWorkspaceId(workspaces[0]?.id??'');}},[workspaces,workspaceId]);
  async function action(name:string,job:()=>Promise<void>){
    if(pending.current===key)return;const id=generation.current;pending.current=key;setBusy(name);setError(null);
    try{await job();}catch(requestError){if(id===generation.current)setError(requestError instanceof Error?requestError.message:t('操作失败','Action failed'));}
    finally{if(id===generation.current){pending.current=null;setBusy('');}}
  }
  async function reload(id:number){const next=await read(workspaceId);if(id===generation.current)setSnapshot(next);}
  function refresh(connectionId:string){const id=generation.current;return action('refresh',async()=>{
    const result=await facebookManagementRequest<FacebookReadPage<FacebookManagedPage>>(token,workspaceId,`/connections/${encodeURIComponent(connectionId)}/refresh`,{body:{}});
    if(id!==generation.current)return;const next=await read(workspaceId);
    if(id===generation.current){if(result.stale){next.directory.stale=true;next.directory.warnings=[...(result.warnings??[]),...next.directory.warnings];}setSnapshot(next);}
  });}
  function choose(managedPageId:string){if(!managedPageId)return;const id=generation.current;return action('select',async()=>{
    await facebookManagementRequest(token,workspaceId,`/pages/${encodeURIComponent(managedPageId)}/select`,{body:{}});if(id===generation.current)await reload(id);
  });}
  function confirm(){const request=dialog,id=generation.current;setDialog(null);if(!request)return;
    return action(request.kind,async()=>{
      if(request.kind==='disconnect'){
        await facebookManagementRequest(token,workspaceId,`/connections/${encodeURIComponent(request.connectionId!)}/disconnect`,{body:{}});if(id===generation.current)await reload(id);
      }else{
        const result=await facebookManagementRequest<{authorizationUrl:string}>(token,workspaceId,'/oauth/start',{body:{}});if(id!==generation.current)return;
        const url=new URL(result.authorizationUrl);if(url.origin!=='https://www.facebook.com'||url.username||url.password||!url.pathname.endsWith('/dialog/oauth'))throw Error(t('授权链接不可用','Authorization link unavailable'));
        window.location.assign(url.href);
      }
    });
  }
  const all=visible?.directory.items??[],connections=visible?.connections??[];
  const businesses=[...new Map(all.flatMap(p=>p.businesses).map(b=>[b.id,b])).values()];
  const filtered=all.filter(p=>(!business||(business==='unclassified'?p.businesses.length===0:p.businesses.some(b=>b.id===business)))&&(!connectionFilter||p.connectionChoices?.some(c=>c.connectionId===connectionFilter))&&p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const failure=visible?.directory.warnings.some(w=>!['cached_snapshot','directory_not_read'].includes(w.code));
  return <div className="facebook-management">
    <section className="panel"><div className="facebook-management-heading"><div><h2>{t('BM 主页管理','BM Page management')}</h2><p className="muted">{t('只读目录与独立互动授权；现有发布账号、凭据和排程不变。','Read-only directory and independent interaction authorization. Existing publishing accounts, credentials and schedules stay unchanged.')}</p></div>
      <label>{t('工作区','Workspace')}<select aria-label={t('工作区','Workspace')} value={workspaceId} onChange={event=>{generation.current++;pending.current=null;setSnapshot(null);setDialog(null);setError(null);setEnabled(null);setWorkspaceId(event.target.value);setActiveWorkspaceId(event.target.value);}}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label></div>
      {enabled&&manager?<button type="button" disabled={Boolean(busy)} onClick={()=>setDialog({kind:'connect'})}>{t('连接管理授权','Connect management authorization')}</button>:null}
      {enabled===false?<p role="status">{t('管理员尚未启用此功能，现有发布功能不受影响。','This feature is not enabled. Existing publishing is unaffected.')}</p>:null}
      {busy==='load'?<p role="status">{t('正在读取管理目录…','Loading management directory…')}</p>:null}
      {error?<p role="alert" className="error">{error}</p>:null}
      {visible?.directory.stale?<p role="status" className="facebook-warning">{failure?t('部分读取失败，保留上次成功结果。','Some reads failed. Keeping the last successful result.'):t('当前为缓存目录，请刷新以核对最新授权。','Showing a cached directory. Refresh to check current authorization.')}</p>:null}
      {visible?<p className="muted">{t('最近成功读取：','Last successful read: ')}<time dateTime={visible.directory.readAt}>{new Date(visible.directory.readAt).toLocaleString(locale==='en'?'en-US':'zh-CN')}</time></p>:null}
    </section>
    {dialog?<section className="panel facebook-confirm" role="alertdialog" aria-modal="true" aria-label={dialog.kind==='disconnect'?t('断开管理连接确认','Confirm management disconnect'):t('独立管理授权说明','Independent management authorization')}>
      <h3>{dialog.kind==='disconnect'?t('仅断开管理／互动连接','Disconnect management and interactions only'):t('连接独立 BM／互动授权','Connect independent BM and interaction authorization')}</h3>
      <p>{t('不会解绑发布账号，不会修改现有发布凭据、权限或排程。','This does not disconnect publishing accounts or change existing publishing credentials, permissions or schedules.')}</p>
      <p>{dialog.kind==='disconnect'?t('停止本连接的读取和通知接收；不会自动撤销整个 Meta 应用授权或取消其他连接共用的订阅。','Stops reads and notification reception for this connection. It does not revoke the whole Meta app or shared subscriptions.'):t('用于读取已授权 BM／主页，读取并人工回复主页评论和 Messenger。请在 Meta 页面核对用途和所选资产；同一个 Meta 应用的上游授权可能共享。','Reads authorized BMs and Pages, and enables reading and manual replies to Page comments and Messenger. Review purposes and selected assets on Meta; upstream grants in the same Meta app may be shared.')}</p>
      <div className="facebook-actions"><button type="button" disabled={Boolean(busy)} onClick={confirm}>{dialog.kind==='disconnect'?t('确认断开','Confirm disconnect'):t('前往 Meta 授权','Continue to Meta authorization')}</button><button className="secondary" type="button" onClick={()=>setDialog(null)}>{t('取消','Cancel')}</button></div>
    </section>:null}
    {visible?<>
      <section className="panel facebook-connections"><h3>{t('独立管理连接','Independent management connections')}</h3>{connections.length===0?<p>{t('尚未连接管理授权。发布账号不会自动变成管理连接。','No management connections. Publishing accounts are not automatically imported.')}</p>:connections.map(connection=><div className="facebook-connection-row" key={connection.id}><div><strong>{connection.authorizedBy} · {connection.id.slice(0,8)}</strong><FacebookConnectionStatus status={connection.status} lastReadAt={connection.lastReadAt}/></div>{manager?<div className="facebook-actions"><button className="secondary" type="button" disabled={Boolean(busy)||connection.status!=='active'} onClick={()=>refresh(connection.id)}>{t('刷新目录','Refresh directory')}</button><button className="secondary" type="button" disabled={Boolean(busy)||connection.status==='disconnected'} onClick={()=>setDialog({kind:'disconnect',connectionId:connection.id})}>{t('断开管理连接','Disconnect management')}</button></div>:null}</div>)}</section>
      <section className="panel"><div className="facebook-filters"><label>{t('连接筛选','Connection filter')}<select aria-label={t('连接筛选','Connection filter')} value={connectionFilter} onChange={e=>setConnectionFilter(e.target.value)}><option value="">{t('全部连接','All connections')}</option>{connections.map(c=><option key={c.id} value={c.id}>{c.authorizedBy} · {c.id.slice(0,8)}</option>)}</select></label><label>{t('BM 筛选','Business filter')}<select aria-label={t('BM 筛选','Business filter')} value={business} onChange={e=>setBusiness(e.target.value)}><option value="">{t('全部 BM','All businesses')}</option><option value="unclassified">{t('未识别 BM','Unidentified BM')}</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>{t('名称搜索','Search Page names')}<input aria-label={t('名称搜索','Search Page names')} value={query} onChange={e=>setQuery(e.target.value)}/></label></div></section>
      {all.length===0?<section className="panel"><p>{t('此目录尚无主页。请连接管理授权或刷新目录；没有自动导入发布凭据。','No Pages in this directory. Connect management authorization or refresh. Publishing credentials are never imported.')}</p></section>:null}
      {all.length>0&&!filtered.length?<p>{t('没有符合筛选条件的主页。','No Pages match these filters.')}</p>:null}
      <div className="facebook-management-grid">{filtered.map(p=>{
        const profile=safeFacebookProfileUrl(p.profileUrl),avatar=safeFacebookAvatarUrl(p.avatarUrl),choices=p.connectionChoices??[],selected=choices.find(c=>c.managedPageId===p.selectedManagedPageId);
        return <article className="facebook-page-card" key={p.pageId}><div className="facebook-page-heading">{avatar?<img src={avatar} width={44} height={44} alt="" loading="lazy" referrerPolicy="no-referrer"/>:null}<div><h3>{p.name}</h3><small>{t('主页编号：','Page ID: ')}{p.pageId}</small></div></div>
          <div>{p.businesses.length?p.businesses.map(b=><p key={b.id+':'+b.relation}>{b.name} · {b.relation==='owned'?t('自有主页','Owned Page'):t('客户主页','Client Page')}</p>):<p>{t('未识别 BM','Unidentified BM')}</p>}</div>
          <p>{p.publishingAccountId?t('发布已绑定','Publishing connected'):t('未绑定发布账号','Publishing not connected')}</p><p>{p.authorization==='available'?t('目录授权可用；互动能力仍需核验','Directory authorization available; interaction capabilities are verified separately'):p.authorization==='expired'?t('互动授权已到期','Interaction authorization expired'):t('互动授权缺失','Interaction authorization missing')}</p>
          {manager?<label>{t('互动连接','Interaction connection')}<select aria-label={t('互动连接 ','Interaction connection ')+p.name} value={choices.some(c=>c.managedPageId===p.selectedManagedPageId)?p.selectedManagedPageId??'':''} disabled={Boolean(busy)} onChange={e=>choose(e.target.value)}><option value="">{t('请选择互动授权','Choose an interaction connection')}</option>{choices.map(c=><option key={c.managedPageId} value={c.managedPageId} disabled={!c.available}>{connections.find(connection=>connection.id===c.connectionId)?.authorizedBy??t('连接','Connection')} · {c.connectionId.slice(0,8)}{c.available?'':t('（不可用）',' (unavailable)')}</option>)}</select></label>:<p>{selected?.available?t('已由管理员选择互动连接','Interaction connection selected by an administrator'):t('请管理员选择可用的互动授权','Ask an administrator to choose an available interaction connection')}</p>}
          <div className="facebook-actions">{profile?<a className="button secondary" href={profile} target="_blank" rel="noopener noreferrer">{t('查看公共主页 ↗','Open Page ↗')}</a>:null}{p.publishingAccountId&&selected?.available?<a className="button" href={`/facebook-inbox?workspaceId=${encodeURIComponent(workspaceId)}&managedPageId=${encodeURIComponent(selected.managedPageId)}&connectionId=${encodeURIComponent(selected.connectionId)}`}>{t('打开 Facebook 收件箱','Open Facebook inbox')}</a>:null}</div>
          {!p.publishingAccountId?<p className="muted">{t('请先到社交账号绑定此主页；此处不会自动绑定。','Connect this Page under Social accounts first. Nothing is automatically connected here.')} <a href="/social-accounts">{t('社交账号','Social accounts')}</a></p>:null}
        </article>;
      })}</div>
    </>:null}
  </div>;
}
