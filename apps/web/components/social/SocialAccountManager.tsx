'use client';
import React,{useEffect,useId,useRef,useState,type ReactNode} from 'react';
import type {OAuthProviderStatus,SocialAccount} from '../../lib/api';
import {supportedPlatformIds,filterSupportedPlatforms} from '../../lib/platformCounts';
import {accountStatusLabel,platformLabel} from '../../lib/labels';
import {authorizationWarning} from '../../lib/authorizationWarning';
import {useLanguage} from '../LanguageProvider';
import {PlatformLogo} from '../PlatformLogo';
import {SocialAccountProfileLink} from './SocialAccountProfileLink';
import {TikTokAccountStatsPanel} from '../channels/TikTokAccountStatsPanel';
import {useAccountProfileSync,type ProfileRefresh} from './useAccountProfileSync';
import {AccountPermissionSummary} from './AccountPermissionSummary';

type Props={accounts:SocialAccount[];providers:OAuthProviderStatus[];workspaceId:string;token:string;canManage:boolean;loading:boolean;failed:boolean;actionError?:string|null;onAdd(provider:OAuthProviderStatus):void;onDisconnect(id:string):Promise<unknown>;onRefresh?:ProfileRefresh};

function AccountDialog({title,onClose,closeLabel,children,wide=false}:{title:string;onClose():void;closeLabel:string;children:ReactNode;wide?:boolean}){
  const titleId=useId(),container=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    container.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return()=>{if(previous?.isConnected)previous.focus?.();};
  },[]);
  return <div className="channel-modal-backdrop account-manager-backdrop" onClick={onClose}>
    <section className={'channel-modal account-manager-dialog'+(wide?' account-details-dialog':'')} ref={container} role="dialog" aria-modal={true} aria-labelledby={titleId} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
      if(e.key==='Tab'){
        const nodes=Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary')??[]).filter(el=>el.getClientRects().length>0);
        const first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }}>
      <div className="account-manager-dialog-header"><h2 id={titleId}>{title}</h2><button className="button secondary" type="button" onClick={onClose}>{closeLabel}</button></div>
      {children}
    </section>
  </div>;
}

function AccountAvatar({account}:{account:SocialAccount}){
  const [failed,setFailed]=useState(false);
  let safe=false;try{const url=new URL(account.avatarUrl??'');safe=url.protocol==='https:'&&!url.username&&!url.password;}catch{}
  return <div className="account-manager-avatar">
    {safe&&!failed?<img src={account.avatarUrl} alt="" width={48} height={48} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span aria-hidden="true" data-avatar-fallback={true}><svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor"><circle cx="16" cy="11" r="6"/><path d="M5 29v-3a11 11 0 0 1 22 0v3Z"/></svg></span>}
    <PlatformLogo platform={account.platform}/>
  </div>;
}

export function SocialAccountManager(props:Props){
  return <AccountManagerContent key={props.token+':'+props.workspaceId} {...props}/>;
}
function AccountManagerContent({accounts,providers,workspaceId,token,canManage,loading,failed,actionError,onAdd,onDisconnect,onRefresh}:Props){
  const {t,locale}=useLanguage();
  const [platform,setPlatform]=useState('all'),[query,setQuery]=useState(''),[layout,setLayout]=useState<'cards'|'list'>('cards'),[selectedId,setSelectedId]=useState<string|null>(null),[adding,setAdding]=useState(false),[removing,setRemoving]=useState(false);
  const profileSync=useAccountProfileSync(accounts,canManage&&!loading&&!failed,onRefresh);
  const supported=filterSupportedPlatforms(accounts),search=query.trim().toLocaleLowerCase();
  const visible=supported.filter(a=>(platform==='all'||a.platform===platform)&&(!search||[a.displayName,a.providerAccountId].some(value=>value.toLocaleLowerCase().includes(search))));
  const selected=!loading&&!failed?supported.find(a=>a.id===selectedId):undefined;
  const configuredProviders=filterSupportedPlatforms(providers);
  const currentProvider=configuredProviders.find(p=>p.platform===platform);
  const date=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString(locale==='en'?'en-US':'zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):t('暂无记录','Not available');
  function status(account:SocialAccount){const warning=authorizationWarning(account);return <span className={account.status==='active'&&!warning?'status-pill ready':'status-pill warning'}>{accountStatusLabel(account.status,locale)}{warning?<span> · {warning==='expired'?t('续期凭证已到期','Renewal credential expired'):t('续期凭证即将到期','Renewal credential expires soon')}</span>:null}</span>;}
  function identity(account:SocialAccount){return <div className="account-manager-identity"><AccountAvatar key={account.id+':'+account.avatarUrl+':'+account.capabilities.profileSync?.lastSuccessAt} account={account}/><div><strong>{account.displayName}</strong><small className="muted">{platformLabel(account.platform)}{account.accountType==='page'?t(' · 公共主页',' · Page'):''}</small></div></div>;}
  function detailButton(account:SocialAccount){return <button className="button secondary" type="button" aria-label={t(`查看 ${account.displayName} 详情`,`View ${account.displayName} details`)} onClick={()=>setSelectedId(account.id)}>{t('详情','Details')}</button>;}
  return <section className="panel account-manager" aria-label={t('账号管理','Account management')} aria-busy={loading}>
    <div className="row"><div><p className="section-kicker">{t('我的社交账号','My social accounts')}</p><h2>{t('账号管理','Account management')}</h2></div><p className="muted">{t('查看与管理当前工作区的账号','Browse and manage accounts in this workspace')}</p></div>
    <div className="account-manager-platforms" role="group" aria-label={t('筛选平台','Filter by platform')}>
      {['all',...supportedPlatformIds].map(id=>{const count=loading||failed?'—':id==='all'?supported.length:supported.filter(a=>a.platform===id).length;const label=(id==='all'?t('全部','All'):platformLabel(id))+` (${count})`;return <button className={platform===id?'account-platform-filter selected':'account-platform-filter'} type="button" aria-pressed={platform===id} aria-label={label} key={id} onClick={()=>setPlatform(id)}>{id!=='all'?<PlatformLogo platform={id}/>:null}{label}</button>;})}
    </div>
    <div className="account-manager-toolbar">
      <div className="account-manager-layout" role="group" aria-label={t('显示方式','View mode')}>
        <button type="button" className="button secondary" aria-label={t('卡片视图','Card view')} aria-pressed={layout==='cards'} onClick={()=>setLayout('cards')}><span aria-hidden="true">▦</span> {t('卡片','Cards')}</button>
        <button type="button" className="button secondary" aria-label={t('列表视图','List view')} aria-pressed={layout==='list'} onClick={()=>setLayout('list')}><span aria-hidden="true">☰</span> {t('列表','List')}</button>
      </div>
      <input type="search" aria-label={t('搜索账号','Search accounts')} placeholder={t('搜索账号名称或 ID','Search account name or ID')} value={query} onChange={e=>setQuery(e.target.value)}/>
      {canManage?<button className="button" type="button" disabled={loading||!configuredProviders.some(p=>p.configured)} onClick={()=>{if(currentProvider?.configured)onAdd(currentProvider);else setAdding(true);}}>{t('添加账号','Add account')}</button>:null}
    </div>
    {loading?<p role="status" className="muted">{t('正在读取账号…','Loading accounts…')}</p>:failed?<p role="alert" className="error">{t('账号读取失败，请刷新页面重试。','Unable to load accounts. Refresh the page to retry.')}</p>:!visible.length?<div className="account-manager-empty"><strong>{supported.length?t('没有匹配的账号','No matching accounts'):t('暂无社交账号','No social accounts yet')}</strong><p className="muted">{supported.length?t('试试更换平台或搜索内容。','Try another platform or search.'):canManage?t('点击“添加账号”，通过平台官方授权连接。','Add an account using the platform’s official authorization.'):t('请联系工作区所有者或管理员添加账号。','Ask a workspace owner or administrator to add an account.')}</p></div>:layout==='cards'?<div className="account-manager-grid">
      {visible.map(account=><article className="account-manager-card" key={account.id}>{identity(account)}<div>{status(account)}</div><div className="account-manager-actions"><SocialAccountProfileLink platform={account.platform} profileUrl={account.profileUrl}/>{detailButton(account)}</div></article>)}
    </div>:<div className="account-manager-table-wrap"><table className="account-manager-table"><thead><tr><th>{t('账号名称','Account')}</th><th>{t('状态','Status')}</th><th>{t('操作','Actions')}</th></tr></thead><tbody>{visible.map(account=><tr key={account.id}><td>{identity(account)}</td><td>{status(account)}</td><td><div className="account-manager-actions"><SocialAccountProfileLink platform={account.platform} profileUrl={account.profileUrl}/>{detailButton(account)}</div></td></tr>)}</tbody></table></div>}
    {!loading&&!failed?<p className="account-manager-count muted" aria-live="polite">{t(`显示 ${visible.length} / ${supported.length} 个账号`,`Showing ${visible.length} of ${supported.length} accounts`)}</p>:null}
    {adding&&canManage&&!loading?<AccountDialog title={t('选择添加账号的平台','Choose an account platform')} closeLabel={t('取消','Cancel')} onClose={()=>setAdding(false)}><div className="account-manager-provider-picker">{configuredProviders.map(provider=><button className="button secondary" type="button" disabled={!provider.configured} key={provider.platform} onClick={()=>{setAdding(false);onAdd(provider);}}><PlatformLogo platform={provider.platform}/>{provider.displayName}{!provider.configured?<small>{t('未配置','Not configured')}</small>:null}</button>)}</div><p className="muted">{t('下一步可选择官方授权或分享授权，当前不会自动发起授权。','Next, choose official or shared authorization. No authorization starts automatically.')}</p></AccountDialog>:null}
    {selected?<AccountDialog wide title={t('账号详情','Account details')} closeLabel={t('关闭详情','Close details')} onClose={()=>{if(!removing)setSelectedId(null);}}>
      <div className="account-detail-hero"><div>{identity(selected)}<p className="account-detail-binding muted">{t('绑定时间（北京时间）：','Connected (Beijing time): ')}<time dateTime={selected.createdAt}>{date(selected.createdAt)}</time></p></div><div>{status(selected)}</div></div>
      <AccountPermissionSummary account={selected} workspaceId={workspaceId} token={token}/>
      <details className="account-technical-details"><summary>{t('技术详情','Technical details')}</summary><p className="muted">{t('以下仅为授权记录与到期信息，不展示访问密钥。绑定时间不等同于平台审核或授权通过时间。','Stored grant and expiry details only; access secrets are not shown. Connection time is not the platform review or grant time.')}</p><dl className="account-manager-detail-fields"><div><dt>{t('平台账号 ID','Platform account ID')}</dt><dd>{selected.providerAccountId}</dd></div><div><dt>{t('绑定记录创建时间（北京时间）','Connection record created (Beijing time)')}</dt><dd>{date(selected.createdAt)}</dd></div><div><dt>{t('访问凭证到期时间','Access credential expires')}</dt><dd>{date(selected.credential?.expiresAt)}</dd></div><div><dt>{t('续期凭证到期时间','Renewal credential expires')}</dt><dd>{date(selected.credential?.refreshTokenExpiresAt)}</dd></div><div><dt>{t('凭据更新时间（北京时间）','Credential updated (Beijing time)')}</dt><dd>{date(selected.credential?.updatedAt)}</dd></div><div><dt>{t('已记录的授权权限','Recorded permission grants')}</dt><dd>{selected.credential?.scopes?.length?selected.credential.scopes.join(', '):t('暂无记录','Not available')}</dd></div></dl></details>
      <SocialAccountProfileLink platform={selected.platform} profileUrl={selected.profileUrl}/>
      <p className="muted">{t('最近成功同步资料：','Last successful profile sync: ')}{date(selected.capabilities.profileSync?.lastSuccessAt)}</p>
      {canManage&&onRefresh?<div><button type="button" className="button secondary" disabled={selected.status!=='active'||profileSync.pending.includes(selected.id)||removing} onClick={()=>profileSync.refresh(selected.id,'manual')}>{profileSync.pending.includes(selected.id)?t('正在同步…','Syncing…'):t('刷新账号资料','Refresh account profile')}</button><p className="muted">{t('进入此页时，超过 24 小时未同步的账号会在后台更新头像和名称。','On page entry, profiles not synced in 24 hours update their photo and name in the background.')}</p></div>:null}
      {profileSync.message?.id===selected.id?<p role={profileSync.message.status==='failed'?'alert':'status'} className={profileSync.message.status==='failed'?'error':'muted'}>{profileSync.message.status==='updated'?t('账号资料已更新。','Account profile updated.'):profileSync.message.status==='skipped'?t('刚刚已尝试同步，请稍后再试。','A sync was attempted recently. Please try again later.'):t('同步失败，已保留原资料；请检查账号授权后重试。','Sync failed. Previous details were retained. Check account authorization and retry.')}</p>:null}
      {selected.platform==='tiktok'?<TikTokAccountStatsPanel key={workspaceId+':'+selected.id+':'+selected.status} token={token} workspaceId={workspaceId} accountId={selected.id} grantedScopes={selected.credential?.scopes??[]} onAuthorize={canManage&&selected.status==='active'?()=>{const provider=configuredProviders.find(p=>p.platform==='tiktok'&&p.configured);if(provider){setSelectedId(null);onAdd(provider);}}:undefined}/>:null}
      {actionError?<p role="alert" className="error">{actionError}</p>:null}
      {canManage?<div className="account-manager-detail-footer"><p className="muted">{t('解除绑定前会再次确认，不会删除平台上的内容。','Confirmation is required before disconnecting. Content on the platform is not deleted.')}</p><button className="button danger-button" type="button" disabled={removing} onClick={async()=>{if(removing)return;setRemoving(true);try{await onDisconnect(selected.id);}finally{setRemoving(false);}}}>{removing?t('处理中…','Working…'):selected.status==='disconnected'?t('删除记录','Delete record'):t('解除绑定','Disconnect')}</button></div>:null}
    </AccountDialog>:null}
  </section>;
}
