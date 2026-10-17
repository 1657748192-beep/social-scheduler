import type {PrismaClient} from '@prisma/client';import {z} from 'zod';
import type {FacebookManagementRuntime} from '../../facebookManagement/runtime';
import {HttpError} from '../../utils/errors';import {capabilities,type InboxAdapter,type ResolvedAsset,type VerifiedItem,type SourceRef} from '../types';
import {sourceSchema} from '../access';import {encodeInboxCursor,decodeInboxCursor} from '../cursor';
export function createFacebookInboxAdapter({db,engagement}:{db:PrismaClient;engagement:FacebookManagementRuntime['engagement']}):InboxAdapter{
 const context=(a:ResolvedAsset)=>{if(a.platform!=='facebook')throw new HttpError(409,'Platform not integrated');return{...a.ctx,managedPageId:sourceSchema.parse(a.sourceRef).managedPageId};};
 async function caps(a:ResolvedAsset){const raw=await engagement.capabilities(context(a));return capabilities.map(capability=>{const key=({'comments.read':'readComments','comments.reply':'replyComments','messages.read':'readMessages','messages.reply':'replyMessages'} as const)[capability as Exclude<typeof capability,'mentions.read'>];const available=!!key&&raw[key]?.status==='available';return{capability,available,reason:capability==='mentions.read'?'not_integrated':available?'available':'authorization_required',verifiedAt:new Date().toISOString()};});}
 function source(a:ResolvedAsset,s:SourceRef){const parsed=sourceSchema.parse(s),current=sourceSchema.parse(a.sourceRef);if(a.platform!=='facebook'||parsed.managedPageId!==current.managedPageId||parsed.connectionId!==current.connectionId||parsed.connectionVersion!==a.connectionVersion)throw new HttpError(404,'Source unavailable');return parsed;}
 const mapMessage=(a:ResolvedAsset,ref:SourceRef,m:any,name:string|null):VerifiedItem=>({providerEventId:m.id,threadId:ref.conversationId!,actorId:ref.participantId??null,actorName:name,kind:'messages',occurredAt:m.timestamp,inbound:m.inbound,deleted:false,sourceRef:ref});
 return{capabilities:caps,
  async list(a,kind,cursor,limit){
   const ctx=context(a),scope={ctx,asset:a.canonicalKey,version:a.connectionVersion,kind},c=cursor?decodeInboxCursor(scope,cursor):{};
   if(kind==='mentions')throw new HttpError(409,'Mentions not integrated');
   const after=typeof c.after==='string'?c.after:undefined,items:VerifiedItem[]=[];let nextCursor:string|null=null;const deadline=Date.now()+25000;
   const budget=()=>{if(Date.now()>deadline)throw new HttpError(503,'Refresh budget exhausted');};
   if(kind==='messages'){
    const threads=await engagement.conversations(ctx,after);if(threads.items.length>25)throw new HttpError(502,'Oversize provider page');
    for(const thread of threads.items){budget();const ref={...sourceSchema.parse(a.sourceRef),conversationId:thread.id,participantId:thread.counterpartyId};const page=await engagement.messages(ctx,thread.id);for(const m of page.items)items.push(mapMessage(a,ref,m,thread.counterpartyName??null));}
    if(threads.nextCursor)nextCursor=encodeInboxCursor(scope,{after:threads.nextCursor});
   }else{
    const offset=typeof c.offset==='string'?c.offset:undefined,scheduleId=typeof c.scheduleId==='string'?c.scheduleId:undefined;
    const rows=await db.schedule.findMany({where:{workspaceId:a.ctx.workspaceId,status:'published',postVariant:{platform:'facebook',socialAccountId:a.accountId},...(scheduleId?{id:scheduleId}:offset?{id:{gt:offset}}:{})},orderBy:{id:'asc'},take:25,include:{publishJobs:{where:{status:'succeeded'},take:1,orderBy:{createdAt:'desc'}}}});
    for(let i=0;i<rows.length;i++){
     budget();const s=rows[i],postId=s.publishJobs[0]?.providerPostId;if(!postId)continue;
     const page=await engagement.comments(ctx,s.id,scheduleId===s.id?after:undefined);
     for(const v of page.items)items.push({providerEventId:v.id,threadId:s.id+':'+v.id,actorId:v.senderId??null,actorName:v.senderName??null,kind:'comments',occurredAt:v.timestamp,inbound:true,deleted:!!v.deleted,sourceRef:{...sourceSchema.parse(a.sourceRef),scheduleId:s.id,postId,commentId:v.id}});
     if(page.nextCursor){nextCursor=encodeInboxCursor(scope,{scheduleId:s.id,after:page.nextCursor});break;}
     if(scheduleId||i===rows.length-1&&rows.length===25)nextCursor=encodeInboxCursor(scope,{offset:s.id});
    }
   }
   return{items,nextCursor,coverage:kind==='comments'?'verified_published_posts':'received_and_read_threads',warnings:kind==='messages'?['recent_message_page_only']:['parent_relationship_unavailable']};
  },
  async detail(a,ref,cursor){
   const s=source(a,ref),ctx=context(a);let page:any;
   if(s.conversationId)page=await engagement.messages(ctx,s.conversationId,cursor);
   else if(s.scheduleId)page=await engagement.comments(ctx,s.scheduleId,cursor);
   else throw new HttpError(404,'Source unavailable');
   const selected=s.conversationId?page.items:page.items.filter((v:any)=>v.id===s.commentId);
   const items=selected.map((v:any)=>({id:v.id,text:typeof v.text==='string'?v.text:null,occurredAt:v.timestamp,inbound:s.conversationId?!!v.inbound:true,senderName:v.senderName??null,deleted:!!v.deleted}));
   return{items,nextCursor:page.nextCursor,officialUrl:s.postId?'https://www.facebook.com/'+encodeURIComponent(s.postId):'https://www.facebook.com/'+encodeURIComponent(a.providerAssetId),replyTarget:s.conversationId??(items.some((i:any)=>i.id===s.commentId&&!i.deleted)?s.commentId!:null),capabilities:await caps(a)};
  },
  async reply(a,ref,text,requestKey){const s=source(a,ref);return s.conversationId?engagement.replyMessage(context(a),{conversationId:s.conversationId,text,requestKey}):s.scheduleId&&s.commentId?engagement.replyComment(context(a),{scheduleId:s.scheduleId,commentId:s.commentId,text,requestKey}):Promise.reject(new HttpError(404,'Reply target unavailable'));},
  async normalizeVerifiedEvent(ids,a){
   if(ids.length>50)throw new HttpError(400,'Event batch too large');const ctx=context(a);
   const rows=await db.facebookInteractionMessage.findMany({where:{id:{in:ids},managedPageId:ctx.managedPageId},take:50});
   const items:VerifiedItem[]=[];
   for(const m of rows){const thread=await db.facebookInteractionThread.findUnique({where:{managedPageId_participantId:{managedPageId:ctx.managedPageId,participantId:m.participantId}}});if(!thread?.providerId)continue;items.push(mapMessage(a,{...a.sourceRef!,sourceRecordId:m.id,conversationId:thread.providerId,participantId:m.participantId},{id:m.providerId,timestamp:m.occurredAt.toISOString(),inbound:!m.isEcho&&m.recipientId===a.providerAssetId},thread.participantName));}
   return items;
  }
 };
}
