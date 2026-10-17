'use client';
import React,{useEffect,useState} from 'react';
import type {SocialAccount} from '../../lib/api';
import {accountPermissionFeatures,permissionStateLabels,type PermissionFeature,type PermissionState} from '../../lib/accountPermissionFeatures';
import {facebookManagementRequest,facebookPageRequest,loadFacebookDirectory,type FacebookCapabilities} from '../../lib/facebookManagement';
import {useLanguage} from '../LanguageProvider';

const iconPaths:Record<PermissionFeature['icon'],string>={
 profile:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 8h5m-5 5h5',
 publish:'M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
 video:'M4 4h16v16H4zM10 8l6 4-6 4z',chart:'M4 20V10m8 10V4m8 16v-7',
 comment:'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5',
 message:'M3 5h18v14H3zM3 6l9 7 9-7',board:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'
};
function PermissionCard({item,state}:{item:Omit<PermissionFeature,'grants'>;state:PermissionState}){
 const {t}=useLanguage();
 return <article className={'account-feature-card is-'+state} aria-label={t(...item.label)} data-account-feature={true}>
  <span className="account-feature-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[item.icon]}/></svg></span>
  <div><h4>{t(...item.label)}</h4><p>{t(...item.description)}</p></div>
  <span className="account-feature-state" data-feature-state={true}>{t(...permissionStateLabels[state])}</span>
 </article>;
}
export function AccountPermissionSummary({account,workspaceId,token}:{account:SocialAccount;workspaceId:string;token:string}){
 const {t}=useLanguage(),features=accountPermissionFeatures(account);
 const granted=features.filter(item=>item.state==='granted').length;
 const uncertain=features.some(item=>item.state==='unknown');
 return <section className="account-permission-summary" aria-label={t('授权功能','Authorized functions')}>
  <div className="account-permission-heading"><div><p className="section-kicker">{t('这个账号能做什么','What this account is authorized for')}</p><h3>{t('授权功能','Authorized functions')}</h3></div><span className="account-permission-count">{t(`已记录 ${granted} / ${features.length} 项授权功能`,`${granted} / ${features.length} functions with recorded grants`)}</span></div>
  <p className="account-permission-help">{t('以下依据此账号已保存的授权记录展示，不代表平台接口实时可用，也不代表软件已提供全部入口。查看此处不会新增授权或续期凭据。','These functions reflect this account’s stored grants, not a live API availability guarantee or a promise of every app feature. Viewing this summary does not request permissions or renew credentials.')}</p>
  {uncertain?<p className="account-permission-notice">{t('账号已断开、凭据待续期、状态异常或授权记录缺失时，功能显示“待核实”；不会根据“已连接”推断全部权限可用。','Disconnected accounts, stale credentials, abnormal status or missing grant records are shown as not verified. Connected status alone does not prove all permissions.')}</p>:null}
  <div className="account-feature-grid">{features.map(item=><PermissionCard key={item.id} item={item} state={item.state}/>)}</div>
  {account.platform==='facebook'?<FacebookAccountPermissions key={[token,workspaceId,account.id,account.providerAccountId,account.status].join(':')} account={account} workspaceId={workspaceId} token={token}/>:null}
 </section>;
}

type ReadState={loading:boolean;capabilities:FacebookCapabilities|null;expired:boolean;notice:'checking'|'disabled'|'unmatched'|'unavailable'|'expired'|'failed'|'verified'};
const interactionFeatures:Array<{key:keyof FacebookCapabilities;item:Omit<PermissionFeature,'grants'>}>=[
 {key:'readComments',item:{id:'readComments',label:['读取评论','Read comments'],description:['读取已关联公共主页帖子的评论。','Read comments on this linked Page’s posts.'],icon:'comment'}},
 {key:'replyComments',item:{id:'replyComments',label:['回复评论','Reply to comments'],description:['以此公共主页身份回复评论。','Reply to comments as this Page.'],icon:'comment'}},
 {key:'readMessages',item:{id:'readMessages',label:['读取私信','Read messages'],description:['读取公共主页收件箱，不是个人账号私信。','Read this Page’s inbox, not personal messages.'],icon:'message'}},
 {key:'replyMessages',item:{id:'replyMessages',label:['回复私信','Reply to messages'],description:['需满足 Meta 消息窗口等限制，不能任意群发。','Subject to Meta’s messaging window; this does not permit arbitrary bulk messages.'],icon:'message'}}
];
function FacebookAccountPermissions({account,workspaceId,token}:{account:SocialAccount;workspaceId:string;token:string}){
 const {t}=useLanguage(),[attempt,setAttempt]=useState(0),[read,setRead]=useState<ReadState>({loading:true,capabilities:null,expired:false,notice:'checking'});
 useEffect(()=>{
  let current=true;const abort=new AbortController();
  const save=(patch:Partial<ReadState>)=>{if(current)setRead({loading:false,capabilities:null,expired:false,notice:'failed',...patch});};
  if(account.status!=='active'||!/^\d+$/.test(account.providerAccountId)){save({notice:'unavailable'});return;}
  setRead({loading:true,capabilities:null,expired:false,notice:'checking'});
  void (async()=>{
   try{
    const status=await facebookManagementRequest<{enabled:boolean;configured:boolean}>(token,workspaceId,'/status',{signal:abort.signal});
    if(!current)return;
    if(status.enabled!==true||status.configured!==true){save({notice:'disabled'});return;}
    // Existing directory GET reads a saved snapshot; never refresh/select a grant here.
    const directory=await loadFacebookDirectory(token,workspaceId,abort.signal);
    if(!current)return;
    const page=directory.items.find(row=>row.publishingAccountId===account.id&&row.pageId===account.providerAccountId&&row.selectedManagedPageId===row.id);
    if(!page){save({notice:'unmatched'});return;}
    if(page.authorization==='expired'){save({expired:true,notice:'expired'});return;}
    if(page.authorization!=='available'){save({notice:'unavailable'});return;}
    const capabilities=await facebookPageRequest<FacebookCapabilities>(token,{workspaceId,managedPageId:page.id,connectionId:page.connectionId},'/capabilities',{signal:abort.signal});
    save({capabilities,notice:'verified'});
   }catch{save({notice:'failed'});}
  })();
  return()=>{current=false;abort.abort();};
 },[token,workspaceId,account.id,account.providerAccountId,account.status,attempt]);
 const notices:Record<ReadState['notice'],[string,string]>={
  checking:['正在只读核验此公共主页的独立管理授权…','Checking this Page’s independent management access (read-only)…'],
  disabled:['独立管理尚未启用或配置，暂不能核实评论和私信权限。','Independent management is not enabled or configured; comment and message access is unverified.'],
  unmatched:['未找到与此账号、公共主页编号一致的已选管理连接，请到 BM 主页管理核对。','No selected management connection matches this account and Page ID. Check BM Page management.'],
  unavailable:['此管理连接或关联的发布连接当前不可用，独立管理权限仍待核实。','This management connection or its publishing link is unavailable; management access remains unverified.'],
  expired:['此独立管理授权已到期；不会因此修改发布授权记录。','This independent management grant has expired. Publishing grant records are not modified.'],
  failed:['独立管理权限暂时无法核实，请稍后重试；不会将读取失败当成已授权或未授权。','Management access could not be verified. Try later; a read failure is not proof of a grant or denial.'],
  verified:['已按此公共主页当前选用的管理连接核实；结果也受工作区角色和主页任务限制。','Checked against this Page’s selected management connection. Workspace roles and Page tasks also limit availability.']
 };
 return <section className="account-management-permissions" aria-label={t('Facebook 独立管理授权','Independent Facebook management access')} aria-busy={read.loading}>
  <div className="account-permission-heading"><h3>{t('Facebook 独立管理授权','Independent Facebook management access')}</h3><button type="button" className="button secondary" disabled={read.loading||account.status!=='active'} onClick={()=>setAttempt(value=>value+1)}>{read.loading?t('正在核验…','Checking…'):t('刷新权限状态','Refresh access status')}</button></div>
  <p className="account-permission-help" role="status">{t(...notices[read.notice])}</p>
  <div className="account-feature-grid">{interactionFeatures.map(({key,item})=>{
   const status=read.capabilities?.[key]?.status;
   const state:PermissionState=read.expired?'expired':status==='available'?'verified':status==='missing'?'restricted':'unknown';
   return <PermissionCard key={key} item={item} state={state}/>;
  })}</div>
  <p className="account-permission-help">{t('发布授权与管理授权相互独立。以上状态不保证真实评论或私信已通过 Webhook 自动投递，也不解除平台的回复窗口限制。','Publishing and management grants are independent. These states do not prove real Webhook delivery or remove platform reply-window restrictions.')}</p>
 </section>;
}
