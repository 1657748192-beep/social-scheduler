import {z} from 'zod';import {randomUUID} from 'node:crypto';
import {HttpError} from '../utils/errors';import {readBoundedInstagramJson} from './http';
import type {SendOutcome} from '../interactionInbox/types';
const id=z.string().regex(/^[-a-zA-Z0-9_:.]{1,256}$/).refine(v=>v!=='.'&&v!=='..'),actor=z.object({id,username:z.string().max(256).optional()});
const timestamp=z.string().max(100).refine(s=>Number.isFinite(Date.parse(s)));
export const instagramMediaDto=z.object({id});
export const instagramCommentDto=z.object({id,text:z.string().max(10000).optional(),timestamp,from:actor,username:z.string().max(256).optional(),parent_id:id.optional()});
export const instagramConversationDto=z.object({id,participants:z.object({data:z.array(actor).min(2).max(2)}),updated_time:timestamp.optional()});
export const instagramMessageDto=z.object({id,message:z.string().max(10000).optional(),created_time:timestamp,from:actor,to:z.object({data:z.array(actor).min(1).max(2)})});
export type InstagramMediaDto=z.infer<typeof instagramMediaDto>;
export type InstagramCommentDto=z.infer<typeof instagramCommentDto>;
export type InstagramConversationDto=z.infer<typeof instagramConversationDto>;
export type InstagramMessageDto=z.infer<typeof instagramMessageDto>;
export type InstagramGraphPage<T>={items:T[];nextCursor:string|null};
export function createInstagramManagementGraph(input:{appId:string;graphVersion:string;accessToken:string;accountId:string;connectionVersion:number;fetchImpl?:typeof fetch}){
 if(!/^\d{1,256}$/.test(input.appId)||!/^\d{1,256}$/.test(input.accountId)||!/^v[1-9]\d?\.0$/.test(input.graphVersion)||!Number.isSafeInteger(input.connectionVersion)||input.connectionVersion<1||!input.accessToken)throw new HttpError(409,'Independent Instagram Graph configuration unavailable');
 const fetchImpl=input.fetchImpl??fetch;
 function cursor(kind:string,after?:string){
  if(!after)return undefined;
  try{if(after.length>8192)throw Error();const c=JSON.parse(Buffer.from(after,'base64url').toString('utf8'));if(c.app!==input.appId||c.account!==input.accountId||c.version!==input.connectionVersion||c.kind!==kind||typeof c.after!=='string'||!c.after||c.after.length>2048)throw Error();return c.after as string;}catch{throw new HttpError(400,'Invalid Instagram cursor');}
 }
 function encode(kind:string,after:string){return Buffer.from(JSON.stringify({app:input.appId,account:input.accountId,version:input.connectionVersion,kind,after})).toString('base64url');}
 async function request(path:string,query:Record<string,string>={},body?:URLSearchParams|Record<string,unknown>){
  const url=new URL(`https://graph.instagram.com/${input.graphVersion}/${path}`);for(const[k,v]of Object.entries(query))url.searchParams.set(k,v);
  let status=0;
  try{
   const value=await readBoundedInstagramJson(async(u,o)=>{const r=await fetchImpl(u,o);status=r.status;return r.ok?r:new Response(r.body,{status:200,headers:r.headers});},url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${input.accessToken}`,...(body?{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'}:{})},body:body?body instanceof URLSearchParams?String(body):JSON.stringify(body):undefined});
   return{value,status};
  }catch{throw new HttpError(502,'Independent Instagram request unavailable');}
 }
 async function page<T>(path:string,kind:string,schema:z.ZodType<T>,after?:string,fields?:string,messageRoot?:string):Promise<InstagramGraphPage<T>>{
  const rawAfter=after?cursor(kind,after):undefined;
  const {value,status}=await request(path,{limit:'25',...(fields?{fields}:{}),...(rawAfter?{after:rawAfter}:{})});
  try{
   if(status<200||status>=300)throw Error();
   const wrapper=value as any,body=kind.startsWith('messages:')?wrapper?.messages??wrapper:wrapper;
   if(messageRoot&&wrapper?.messages!==undefined&&wrapper?.data!==undefined)throw Error();
   const parsed=z.object({data:z.array(schema).max(25),paging:z.object({next:z.string().max(8192).optional(),cursors:z.object({after:z.string().min(1).max(2048).optional()}).optional()}).optional()}).parse(body);
   if(messageRoot&&parsed.paging?.next!==undefined){
    const nextAfter=parsed.paging.cursors?.after;
    if(!nextAfter||nextAfter===rawAfter||!parsed.data.length)throw Error();
    if(messageRoot){
     const next=new URL(parsed.paging.next);
     if(next.origin!=='https://graph.instagram.com'||next.username||next.password||next.pathname!==`/${input.graphVersion}/${messageRoot}/messages`||next.searchParams.get('after')!==nextAfter)throw Error();
    }
   }
   return{items:parsed.data,nextCursor:parsed.paging?.next&&parsed.paging.cursors?.after?encode(kind,parsed.paging.cursors.after):null};
  }catch{throw new HttpError(502,'Invalid Instagram response');}
 }
 const checked=(value:string)=>id.parse(value);
 async function send(path:string,body:URLSearchParams|Record<string,unknown>,key:'id'|'message_id'):Promise<SendOutcome>{
  const diagnosticId=randomUUID();try{
   const {value,status}=await request(path,{},body),payload=value as any;
   if(status>=400&&status<500&&![408,429].includes(status)&&payload?.error)return{status:'failed',code:'provider_rejected',diagnosticId};
   if(status<200||status>=300||payload?.error)return{status:'unknown',diagnosticId};
   return{status:'sent',providerId:checked(payload?.[key])};
  }catch{return{status:'unknown',diagnosticId};}
 }
 function text(value:string,limit:number){if(typeof value!=='string'||!value.trim()||value.length>limit)throw new HttpError(400,'Invalid Instagram reply');return value;}
 return{
  async identity(){const{value,status}=await request('me',{fields:'id,user_id,username'});try{if(status!==200)throw Error();const v=z.object({id,user_id:id.optional(),username:z.string().max(256).optional()}).parse(value);if(v.id!==input.accountId&&v.user_id!==input.accountId)throw Error();return v;}catch{throw new HttpError(403,'Instagram account identity unavailable');}},
  media:(after?:string)=>page(`${input.accountId}/media`,'media',instagramMediaDto,after,'id'),
  comments:async(mediaId:string,after?:string)=>page(`${checked(mediaId)}/comments`,`comments:${mediaId}`,instagramCommentDto,after,'id,text,username,timestamp,from,parent_id'),
  conversations:(after?:string)=>page(`${input.accountId}/conversations`,'conversations',instagramConversationDto,after,'id,updated_time,participants'),
  messages:async(conversationId:string,after?:string)=>page(after?`${checked(conversationId)}/messages`:checked(conversationId),`messages:${conversationId}`,instagramMessageDto,after,after?'id,message,created_time,from,to':'messages{id,message,created_time,from,to}',conversationId),
  async conversation(conversationId:string){const{value,status}=await request(checked(conversationId),{fields:'id,participants'});try{if(status!==200)throw Error();const v=instagramConversationDto.parse(value);if(v.id!==conversationId)throw Error();return v;}catch{throw new HttpError(502,'Instagram conversation unavailable');}},
  async replyComment(commentId:string,value:string){return send(`${checked(commentId)}/replies`,new URLSearchParams({message:text(value,8000)}),'id');},
  async sendMessage(participantId:string,value:string){checked(participantId);if(participantId===input.accountId)throw new HttpError(400,'Invalid Instagram recipient');return send(`${input.accountId}/messages`,{recipient:{id:participantId},message:{text:text(value,2000)}},'message_id');},
  async subscriptions(){const{value,status}=await request(`${input.accountId}/subscribed_apps`);try{if(status!==200)throw Error();return z.object({data:z.array(z.object({id,subscribed_fields:z.array(z.enum(['comments','messages'])).max(2)})).max(50)}).parse(value).data.filter(v=>v.id===input.appId);}catch{throw new HttpError(502,'Instagram subscriptions unavailable');}},
  async subscribe(_fields:string[]):Promise<never>{throw new HttpError(409,'Subscription changes require verified live configuration');}
 };
}
export type InstagramManagementGraph=ReturnType<typeof createInstagramManagementGraph>;
