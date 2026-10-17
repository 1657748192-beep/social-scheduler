import {apiRequest} from './api';
export type InboxKind='comments'|'messages'|'mentions';
export const inboxPlatforms=['facebook','instagram','tiktok','youtube','pinterest'] as const;
export type InboxCapability={capability:string;available:boolean;reason:string;verifiedAt:string|null};
export type InboxAccount={id:string;platform:string;name:string;avatarUrl:string|null;publishingStatus:string;capabilities:InboxCapability[]};
export type InboxTag={id:string;kind:string;name:string;color:string;version:number};
export type InboxCase={id:string;kind:InboxKind;accountId:string;customerId:string|null;customerName:string|null;sourceLabel:string;status:string;version:number;lastInboundAt:string|null;unread:boolean;tags:InboxTag[];assigneeId:string|null;sentiment:string|null};
export type InboxPage<T>={items:T[];nextCursor:string|null;accountsStatus:Array<{accountId:string;status:string;count:number|null}>;partial:boolean;observedAt:string;lastSuccessfulSyncAt:string|null};
export type InboxDetail=InboxCase&{items:Array<{id:string;text:string|null;occurredAt:string;inbound:boolean;senderName?:string|null;deleted?:boolean}>;nextCursor:string|null;officialUrl:string|null;replyTarget:string|null;capabilities:InboxCapability[]};
export type InboxCustomer={id:string;version:number;name:string|null;identities:Array<{platform:string;name:string|null;username:string|null;avatarUrl:string|null;profileUrl:string|null;accountId:string}>;tags:InboxTag[];notes:Array<{id:string;text:string;authorId:string;createdAt:string}>;cases:InboxCase[]};
export type InboxSend={status:'sent';providerId:string}|{status:'failed';code:string;diagnosticId:string}|{status:'unknown';diagnosticId:string};
export function inboxRequest<T>(token:string,workspaceId:string,path:string,options:{method?:string;body?:unknown;signal?:AbortSignal}={}){return apiRequest<T>(`/workspaces/${encodeURIComponent(workspaceId)}/interaction-inbox${path}`,{token,...options});}
export function inboxQuery(input:Record<string,unknown>){const q=new URLSearchParams();for(const [k,v] of Object.entries(input))if(v!==undefined&&v!==null&&v!=='')q.set(k,Array.isArray(v)?v.join(','):String(v));return'?'+q.toString();}
export function safeInboxLink(value:string|null|undefined){if(!value)return null;try{const u=new URL(value);const hosts=['facebook.com','fbcdn.net','instagram.com','cdninstagram.com','tiktok.com','tiktokcdn.com','youtube.com','ytimg.com','ggpht.com','googleusercontent.com','pinterest.com','pinimg.com'];return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:null;}catch{return null;}}
