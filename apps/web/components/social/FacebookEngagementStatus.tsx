'use client';
import React,{useEffect,useRef,useState} from 'react';
import { apiRequest } from '../../lib/api';
import { createFacebookRequestGuard,facebookAccountPath,type FacebookCapabilities } from '../../lib/facebookEngagement';
import { useLanguage } from '../LanguageProvider';
import { PlatformLogo } from '../PlatformLogo';
export function FacebookEngagementStatusView({capabilities,canManage,loading,error,onAuthorize,onRefresh}:{capabilities:FacebookCapabilities|null;canManage:boolean;loading:boolean;error:string|null;onAuthorize():void;onRefresh():void}){
  const {t}=useLanguage();const label=(status?:string)=>status==='available'?t('可用','Available'):status==='missing'?t('未获准','Not granted'):t('尚未确认','Not verified');
  return <div className="instagram-engagement-panel"><div className="button-row"><PlatformLogo platform="facebook"/><strong>{t('Facebook 互动与消息','Facebook activity and messages')}</strong></div>
    <p className="muted">{t('评论读取','Read comments')}: {label(capabilities?.readComments.status)} · {t('评论回复','Reply to comments')}: {label(capabilities?.replyComments.status)} · {t('私信','Messenger')}: {label(capabilities?.readMessages.status)} · {t('订阅','Subscription')}: {label(capabilities?.subscription.status)}</p>
    <p className="muted">{t('Meta 实际投递尚需测试；权限状态不代表消息已接通。','Real Meta delivery still needs testing; permission status does not prove delivery.')}</p>
    {error?<p className="error" role="alert">{error}</p>:null}<div className="button-row"><button type="button" className="button secondary" disabled={loading} onClick={onRefresh}>{t('刷新状态','Refresh status')}</button>
      {canManage?<button type="button" className="button" disabled={loading} onClick={onAuthorize}>{t('补充授权','Authorize activity')}</button>:null}</div></div>;
}
export function FacebookEngagementStatus({token,workspaceId,socialAccountId,canManage}:{token:string;workspaceId:string;socialAccountId:string;canManage:boolean}){
  const {t}=useLanguage(),guard=useRef(createFacebookRequestGuard());guard.current.reset(`${workspaceId}:${socialAccountId}:${token}`);
  const [capabilities,setCapabilities]=useState<FacebookCapabilities|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
  async function refresh(){setLoading(true);try{const result=await guard.current.run('status',()=>apiRequest<FacebookCapabilities>(facebookAccountPath(workspaceId,socialAccountId)+'/capabilities',{token}));if(result.current){setCapabilities(result.value);setError(null);}}catch(e){setError(e instanceof Error?e.message:t('状态读取失败','Status unavailable'));}finally{setLoading(false);}}
  useEffect(()=>{setCapabilities(null);setError(null);void refresh();},[workspaceId,socialAccountId,token]);
  async function authorize(){setLoading(true);try{const result=await guard.current.run('authorize',()=>apiRequest<{authorizationUrl:string}>(`/workspaces/${encodeURIComponent(workspaceId)}/social-accounts/${encodeURIComponent(socialAccountId)}/facebook-engagement/oauth/start`,{token,method:'POST'}));if(result.current)window.location.assign(result.value.authorizationUrl);}catch(e){setError(e instanceof Error?e.message:t('授权失败','Authorization failed'));}finally{setLoading(false);}}
  return <FacebookEngagementStatusView capabilities={capabilities} canManage={canManage} loading={loading} error={error} onRefresh={()=>void refresh()} onAuthorize={()=>void authorize()}/>;
}
