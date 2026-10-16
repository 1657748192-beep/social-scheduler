'use client';
import React,{useEffect,useState} from 'react';
import {useLanguage} from '../LanguageProvider';
import {PlatformLogo} from '../PlatformLogo';
import {useFacebookScope} from '../facebook/useFacebookScope';
import {facebookPageRequest,facebookInteractionKey,type FacebookInteractionContext,type FacebookCapabilities,type FacebookNotificationStatus} from '../../lib/facebookManagement';
import {setActiveWorkspaceId} from '../../lib/activeWorkspace';
export function FacebookEngagementStatusView({capabilities,canManage,loading,error,onAuthorize,onRefresh,notifications,onEnable,enabling=false}:{capabilities:FacebookCapabilities|null;canManage:boolean;loading:boolean;error:string|null;onAuthorize():void;onRefresh():void;notifications?:FacebookNotificationStatus|null;onEnable?():void;enabling?:boolean}){
  const {t,locale}=useLanguage(),label=(status?:string)=>status==='available'?t('可用','Available'):status==='missing'?t('未获准','Not granted'):t('尚未确认','Not verified');
  return <div className="facebook-status-panel"><div className="facebook-actions"><PlatformLogo platform="facebook"/><strong>{t('Facebook 独立互动授权','Independent Facebook interaction authorization')}</strong></div>
    <p>{t('评论读取','Read comments')}: {label(capabilities?.readComments.status)} · {t('评论回复','Reply to comments')}: {label(capabilities?.replyComments.status)} · {t('私信读取','Read messages')}: {label(capabilities?.readMessages.status)} · {t('私信回复','Reply to messages')}: {label(capabilities?.replyMessages.status)}</p>
    <p>{t('通知权限','Notification permission')}: {label(capabilities?.subscription.status)} · {t('实际订阅配置','Actual subscription')}: {label(notifications?.subscription)} · {t('本连接接收','Reception for this connection')}: {notifications?.enabled?t('已启用','Enabled'):t('未启用','Not enabled')}</p>
    {notifications?.lastReceivedAt?<p>{t('最近验签通知：','Last signed notification: ')}<time dateTime={notifications.lastReceivedAt}>{new Date(notifications.lastReceivedAt).toLocaleString(locale==='en'?'en-US':'zh-CN')}</time></p>:null}
    <p className="muted">{t('权限可用不代表真实消息已投递。通知与主动 API 读取独立，启用通知不会修改发布绑定。','Granted permissions do not prove real delivery. Notifications and active API reads are independent; enabling notifications does not change publishing bindings.')}</p>
    {error?<p role="alert" className="error">{error}</p>:null}<div className="facebook-actions"><button type="button" className="secondary" disabled={loading} onClick={onRefresh}>{t('刷新状态','Refresh status')}</button>
      {canManage?<button type="button" className="secondary" onClick={onAuthorize}>{t('管理授权','Manage authorization')}</button>:null}
      {canManage&&onEnable&&!notifications?.enabled?<button type="button" disabled={enabling||loading||capabilities?.subscription.status!=='available'||capabilities?.readMessages.status!=='available'||capabilities?.readComments.status!=='available'} onClick={onEnable}>{t('启用评论和私信通知','Enable comment and message notifications')}</button>:null}</div>
  </div>;
}
type Props=FacebookInteractionContext&{token:string;canManage:boolean;onCapabilities?:(value:FacebookCapabilities|null)=>void};
export function FacebookEngagementStatus(props:Props){return <StatusController key={facebookInteractionKey(props.token,props)} {...props}/>;}
function StatusController({token,canManage,onCapabilities,...ctx}:Props){
  const {t}=useLanguage(),scope=useFacebookScope(facebookInteractionKey(token,ctx));
  const [capabilities,setCapabilities]=useState<FacebookCapabilities|null>(null),[notifications,setNotifications]=useState<FacebookNotificationStatus|null>(null),[loading,setLoading]=useState(false),[enabling,setEnabling]=useState(false),[error,setError]=useState<string|null>(null);
  async function refresh(){
    if(!scope.alive())return;const current=scope.capture('status');setLoading(true);
    try{
      const [caps,notification]=await Promise.allSettled([facebookPageRequest<FacebookCapabilities>(token,ctx,'/capabilities'),facebookPageRequest<FacebookNotificationStatus>(token,ctx,'/notifications/status')]);
      if(!current())return;
      if(caps.status==='fulfilled'){setCapabilities(caps.value);onCapabilities?.(caps.value);}else{setCapabilities(null);onCapabilities?.(null);}
      if(notification.status==='fulfilled')setNotifications(notification.value);
      setError(caps.status==='rejected'?t('互动权限无法核验，请到 BM 管理检查授权。','Interaction permissions could not be verified. Check BM management.'):notification.status==='rejected'?t('通知状态无法读取；主动 API 读取仍独立核验。','Notification status is unavailable; active API reads are verified independently.'):null);
    }catch{if(current())setError(t('状态读取失败','Status unavailable'));}
    finally{if(current())setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  async function enable(){const send=scope.beginSend();if(!send)return;setEnabling(true);try{await facebookPageRequest(token,ctx,'/notifications/enable',{body:{}});if(send.current())await refresh();}catch{if(send.current())setError(t('通知配置结果未确认，请刷新状态核对。','Notification configuration is unconfirmed. Refresh status to check.'));}finally{if(send.current())setEnabling(false);send.end();}}
  return <FacebookEngagementStatusView capabilities={capabilities} notifications={notifications} canManage={canManage} loading={loading} error={error} onRefresh={()=>void refresh()} onEnable={()=>void enable()} enabling={enabling} onAuthorize={()=>{setActiveWorkspaceId(ctx.workspaceId);window.location.assign('/facebook-management');}}/>;
}
