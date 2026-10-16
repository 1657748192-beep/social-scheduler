import {apiRequest} from './api';
export type FacebookManagedPage={id:string;connectionId:string;pageId:string;name:string;profileUrl:string|null;avatarUrl:string|null;businesses:Array<{id:string;name:string;relation:'owned'|'client'}>;publishingAccountId:string|null;authorization:'available'|'missing'|'expired'|'unknown';lastReadAt:string|null;selectedManagedPageId?:string|null;connectionChoices?:Array<{managedPageId:string;connectionId:string;available:boolean}>};
export type FacebookConnection={id:string;authorizedBy:string;ownConnection:boolean;status:string;createdAt:string;lastReadAt:string|null};
export type FacebookReadPage<T>={items:T[];nextCursor:string|null;readAt:string;source:'graph'|'received'|'mixed';stale:boolean;warnings:Array<{code:string;diagnosticId:string}>};
export type FacebookSendOutcome={status:'sent';providerId:string}|{status:'failed';code:string;diagnosticId:string}|{status:'unknown';diagnosticId:string};
export type FacebookCapabilityState={status:'available'|'missing'|'unknown';reason?:string};
export type FacebookCapabilities=Record<'readComments'|'replyComments'|'readMessages'|'replyMessages'|'subscription',FacebookCapabilityState>;
export type FacebookNotificationStatus={enabled:boolean;subscription:'available'|'missing'|'unknown';lastReceivedAt:string|null;source:'signed_webhook'};
export type FacebookInteractionContext={workspaceId:string;managedPageId:string;connectionId:string};
export function facebookInteractionKey(token:string,ctx:FacebookInteractionContext){return `${token}:${ctx.workspaceId}:${ctx.managedPageId}:${ctx.connectionId}`;}
export function facebookPageRequest<T>(token:string,ctx:FacebookInteractionContext,suffix:string,options:{body?:unknown;signal?:AbortSignal;method?:string}={}){
  return facebookManagementRequest<T>(token,ctx.workspaceId,`/pages/${encodeURIComponent(ctx.managedPageId)}${suffix}`,options);
}
export function newFacebookRequestKey(){if(!globalThis.crypto?.randomUUID)throw Error('Secure request identity is unavailable');return globalThis.crypto.randomUUID();}
export function facebookManagementSendNotice(result:FacebookSendOutcome,english:boolean){
  if(result.status==='sent')return english?'Reply sent.':'回复已发送。';
  if(result.status==='failed')return english?'Reply was not sent. Check permissions and the reply window.':'回复未发送，请检查权限和回复窗口。';
  return english?'Send result unknown. Verify in Meta Business Suite before starting a new reply. This request will not be retried automatically.':'发送结果未知，请先在 Meta Business Suite 核对，再决定是否开始新的回复。此请求不会自动重发。';
}
function safeUrl(value:unknown,avatar=false):string|null{
  if(typeof value!=='string'||value.length>4096)return null;
  try{const url=new URL(value),host=url.hostname;return url.protocol==='https:'&&!url.username&&!url.password&&(host==='facebook.com'||host.endsWith('.facebook.com')||avatar&&(host==='fbcdn.net'||host.endsWith('.fbcdn.net')))?url.href:null;}catch{return null;}
}
export const safeFacebookProfileUrl=(value:unknown)=>safeUrl(value);
export const safeFacebookAvatarUrl=(value:unknown)=>safeUrl(value,true);
export function facebookManagementRequest<T>(token:string,workspaceId:string,suffix:string,options:{body?:unknown;signal?:AbortSignal;method?:string}={}){
  if(!suffix.startsWith('/')||suffix.includes('..'))throw Error('Invalid management path');
  return apiRequest<T>(`/workspaces/${encodeURIComponent(workspaceId)}/facebook-management${suffix}`,{token,method:options.method??(options.body===undefined?'GET':'POST'),body:options.body,signal:options.signal});
}
export async function loadFacebookDirectory(token:string,workspaceId:string,signal?:AbortSignal):Promise<FacebookReadPage<FacebookManagedPage>>{
  const items:FacebookManagedPage[]=[],seen=new Set<string>(),warnings:FacebookReadPage<FacebookManagedPage>['warnings']=[];
  let cursor:string|null=null,stale=false,readAt='';
  for(let page=0;page<100;page++){
    const current:FacebookReadPage<FacebookManagedPage>=await facebookManagementRequest<FacebookReadPage<FacebookManagedPage>>(token,workspaceId,`/pages${cursor?'?cursor='+encodeURIComponent(cursor):''}`,{signal});
    if(!Array.isArray(current.items))throw Error('Invalid Facebook directory response');
    items.push(...current.items);stale=stale||current.stale;warnings.push(...current.warnings);if(!readAt)readAt=current.readAt;
    if(!current.nextCursor)return {...current,items,nextCursor:null,stale,warnings,readAt};
    if(current.nextCursor.length>2048||seen.has(current.nextCursor))throw Error('Invalid Facebook directory pagination');seen.add(current.nextCursor);cursor=current.nextCursor;
  }
  throw Error('Facebook directory read limit reached');
}
