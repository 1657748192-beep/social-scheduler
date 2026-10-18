import type {PrismaClient,Prisma} from '@prisma/client';
import {HttpError} from '../utils/errors';import {isPlatformAdmin} from '../utils/platformAdmin';
import {requireInboxAccess} from '../interactionInbox/access';
import {capabilities,type Capability,type ResolvedAsset,type SourceRef,type VerifiedItem,type AdapterDetail,type AdapterPage,type SendOutcome} from '../interactionInbox/types';
import {parseInboxSource,type InstagramInboxSource} from '../interactionInbox/source';
import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';
import type {createInstagramManagementAccess} from './access';
import type {InstagramManagementGraph} from './graph';
import type {InstagramSourceSubject} from './types';
import {createInstagramSendExecutor} from './sendAttempts';
import {encodeInboxCursor,decodeInboxCursor} from '../interactionInbox/cursor';
type Access=ReturnType<typeof createInstagramManagementAccess>;
type Deps={db:PrismaClient;access:Access;policy:LiveInboxPolicy;graph:(asset:ResolvedAsset,token:string)=>InstagramManagementGraph;isDeleted:(tx:Prisma.TransactionClient,subject:InstagramSourceSubject)=>Promise<boolean>;verifiedCommentLimit:number;now?:()=>Date};
export function createInstagramManagementEngagement({db,access,policy,graph,isDeleted,verifiedCommentLimit,now=()=>new Date()}:Deps){
 const executor=createInstagramSendExecutor({db});
 function source(a:ResolvedAsset,value:SourceRef){
  if(a.platform!=='instagram')throw new HttpError(409,'Instagram platform required');
  const s=parseInboxSource(value,'instagram'),own=parseInboxSource(a.sourceRef,'instagram');
  if(s.connectionId!==own.connectionId||s.connectionVersion!==a.connectionVersion||s.instagramAccountId!==a.accountId)throw new HttpError(404,'Instagram source unavailable');return s;
 }
 function evidence(a:ResolvedAsset,mode:'read'|'send'){return policy.requireAsset({workspaceId:a.ctx.workspaceId,platform:'instagram',appId:a.appNamespace,providerAssetId:a.providerAssetId},mode);}
 async function fresh(a:ResolvedAsset,cap:Capability){
  source(a,a.sourceRef!);
  const current=await access.resolve(a.ctx,a.accountId,cap);
  if(current.platform!=='instagram'||current.canonicalKey!==a.canonicalKey||current.appNamespace!==a.appNamespace||current.providerAssetId!==a.providerAssetId||current.connectionVersion!==a.connectionVersion||current.sourceRef?.connectionId!==a.sourceRef?.connectionId)throw new HttpError(409,'Instagram connection changed');return current;
 }
 async function fence(tx:Prisma.TransactionClient,a:ResolvedAsset,cap:Capability){
  const s=source(a,a.sourceRef!),pre=await tx.instagramManagementConnection.findUnique({where:{id:s.connectionId}});
  await tx.$queryRaw`SELECT id FROM user_sessions WHERE id=${a.ctx.sessionId}::uuid FOR SHARE`;
  const ids=[...new Set([a.ctx.userId,pre?.userId].filter((v):v is string=>!!v))].sort();
  for(const userId of ids)await tx.$queryRaw`SELECT id FROM workspace_members WHERE workspace_id=${a.ctx.workspaceId}::uuid AND user_id=${userId}::uuid FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM social_accounts WHERE id=${a.accountId}::uuid FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${s.connectionId}::uuid FOR UPDATE`;
  await requireInboxAccess(tx,a.ctx,cap.endsWith('.reply')?'write':'read');
  if(a.ctx.accountIds&&!a.ctx.accountIds.includes(a.accountId))throw new HttpError(403,'Instagram account selection denied');
  evidence(a,cap.endsWith('.reply')?'send':'read');
  const c=await tx.instagramManagementConnection.findFirst({where:{id:s.connectionId,workspaceId:a.ctx.workspaceId,appId:a.appNamespace,providerAccountId:a.providerAssetId,version:a.connectionVersion,status:'active',tokenEncrypted:{not:null}}});
  const account=await tx.socialAccount.findFirst({where:{id:a.accountId,workspaceId:a.ctx.workspaceId,platform:'instagram',providerAccountId:a.providerAssetId,status:'active'}});
  const needed=['instagram_business_basic',cap.startsWith('comments.')?'instagram_business_manage_comments':'instagram_business_manage_messages'];
  if(!c||!account||c.expiresAt&&c.expiresAt<=now()||needed.some(v=>!c.scopes.includes(v)))throw new HttpError(409,'Instagram grant unavailable');
  const owner=await tx.workspaceMember.findFirst({where:{workspaceId:c.workspaceId,userId:c.userId,status:'active',role:{in:['owner','admin']}},include:{user:{select:{email:true}}}});
  if(!owner||!isPlatformAdmin(owner.user.email))throw new HttpError(403,'Instagram authorizer unavailable');return c;
 }
 async function target(tx:Prisma.TransactionClient,a:ResolvedAsset,s:InstagramInboxSource){
  const where={workspaceId:a.ctx.workspaceId,connectionId:s.connectionId,connectionVersion:a.connectionVersion,deleted:false,...(s.sourceRecordId?{id:s.sourceRecordId}:{})};
  const row=s.conversationId?await tx.instagramInteractionMessage.findFirst({where:{...where,conversationId:s.conversationId,actorId:s.participantId??'__missing__'}}):s.commentId&&s.mediaId?await tx.instagramInteractionComment.findFirst({where:{...where,providerId:s.commentId,mediaId:s.mediaId}}):null;
  if(!row||row.receivedAt<new Date(now().getTime()-evidence(a,'read').contentRetentionDays*86400000))throw new HttpError(404,'Instagram content unavailable');
  if(await isDeleted(tx,{workspaceId:a.ctx.workspaceId,platform:'instagram',appId:a.appNamespace,providerAssetId:a.providerAssetId,actorId:row.actorId??undefined,providerEventId:row.providerId,eventKind:s.conversationId?'messages':'comments',occurredAt:row.occurredAt,connectionVersion:a.connectionVersion}))throw new HttpError(404,'Instagram content deleted');return row;
 }
 async function remoteTarget(a:ResolvedAsset,s:InstagramInboxSource,g:InstagramManagementGraph){
  if(s.conversationId&&!s.conversationId.startsWith('local:')){
   const c=await g.conversation(s.conversationId),own=await db.instagramManagementConnection.findUniqueOrThrow({where:{id:s.connectionId}}),ids=c.participants.data.map(v=>v.id);
   if(c.id!==s.conversationId||ids.length!==2||!ids.includes(s.participantId!)||![own.providerAccountId,own.providerUserId].some(v=>ids.includes(v))||[own.providerAccountId,own.providerUserId].includes(s.participantId!))throw new HttpError(403,'Instagram conversation ownership unavailable');
  }else if(s.commentId){
   let after:string|undefined,owned=false;
   for(let i=0;i<20;i++){const page=await g.media(after);if(page.items.some(v=>v.id===s.mediaId)){owned=true;break;}if(!page.nextCursor||page.nextCursor===after)break;after=page.nextCursor;}
   if(!owned)throw new HttpError(403,'Instagram media ownership unavailable');
  }
 }
 async function caps(a:ResolvedAsset){return Promise.all(capabilities.map(async capability=>{
  if(capability==='mentions.read')return{capability,available:false,reason:'not_integrated',verifiedAt:null};
  try{await fresh(a,capability);return{capability,available:true,reason:'available',verifiedAt:now().toISOString()};}catch{return{capability,available:false,reason:'authorization_required',verifiedAt:null};}
 }));}
 const map=(a:ResolvedAsset,row:any,kind:'messages'|'comments'):VerifiedItem=>({providerEventId:row.providerId,threadId:kind==='messages'?row.conversationId:row.mediaId+':'+row.providerId,actorId:row.actorId,actorName:row.actorName??null,kind,occurredAt:row.occurredAt.toISOString(),inbound:row.inbound,deleted:row.deleted,sourceRef:{...parseInboxSource(a.sourceRef,'instagram'),sourceRecordId:row.id,...(kind==='messages'?{conversationId:row.conversationId,participantId:row.actorId}:{mediaId:row.mediaId,commentId:row.providerId})}});
 return{
  capabilities:caps,
  async list(a:ResolvedAsset,kind:string,cursor:string|null,limit:number):Promise<AdapterPage>{
   if(!['comments','messages'].includes(kind))throw new HttpError(409,'Instagram mentions not integrated');
   if(!Number.isInteger(limit)||limit<1||limit>50)throw new HttpError(400,'Invalid Instagram page limit');
   const cap=kind==='messages'?'messages.read':'comments.read',scope={ctx:a.ctx,asset:a.canonicalKey,version:a.connectionVersion,kind};
   const c=cursor?decodeInboxCursor(scope,cursor):{},index=c.index??0,offset=c.offset??0;
   if(!Number.isInteger(index)||Number(index)<0||Number(index)>24||!Number.isInteger(offset)||Number(offset)<0||Number(offset)>24||c.after!==undefined&&typeof c.after!=='string'||c.childAfter!==undefined&&typeof c.childAfter!=='string')throw new HttpError(400,'Invalid Instagram page position');
   await fresh(a,cap);
   return access.withAccess(a.ctx,a.accountId,cap,async(current,token)=>{
    if(current.appNamespace!==a.appNamespace||current.connectionVersion!==a.connectionVersion||current.sourceRef?.connectionId!==a.sourceRef?.connectionId)throw new HttpError(409,'Instagram connection changed');
    const g=graph(a,token),parents=kind==='messages'?await g.conversations(c.after as string|undefined):await g.media(c.after as string|undefined);
    if(parents.items.length>25)throw new HttpError(502,'Oversize Instagram page');
    const parent=parents.items[Number(index)];
    if(!parent){if(parents.items.length)throw new HttpError(409,'Instagram page changed');return{items:[],nextCursor:parents.nextCursor?encodeInboxCursor(scope,{after:parents.nextCursor}):null,coverage:'verified_account_edges',warnings:[]};}
    if(c.parentId!==undefined&&c.parentId!==parent.id)throw new HttpError(409,'Instagram page changed');
    if(kind==='messages'){
     const connection=await db.instagramManagementConnection.findFirst({where:{id:a.sourceRef!.connectionId,workspaceId:a.ctx.workspaceId,appId:a.appNamespace,version:a.connectionVersion},select:{providerUserId:true}});
     const own=[a.providerAssetId,connection?.providerUserId];
     await remoteTarget(a,{...parseInboxSource(a.sourceRef,'instagram'),conversationId:parent.id,participantId:(parent as any).participants?.data?.find((p:any)=>!own.includes(p.id))?.id},g);await fresh(a,cap);
    }
    const page=kind==='messages'?await g.messages(parent.id,c.childAfter as string|undefined):await g.comments(parent.id,c.childAfter as string|undefined);
    if(page.items.length>25)throw new HttpError(502,'Oversize Instagram page');
    if(c.anchor!==undefined&&c.anchor!==(page.items[0] as any)?.id)throw new HttpError(409,'Instagram page changed');
    const selected=page.items.slice(Number(offset),Number(offset)+limit),items:VerifiedItem[]=[];
    await fresh(a,cap);
    await db.$transaction(async tx=>{
     const conn=await fence(tx,a,cap),own=[conn.providerAccountId,conn.providerUserId],ref=source(a,a.sourceRef!);
     for(const raw of selected as any[]){
      const at=Date.parse(kind==='messages'?raw.created_time:raw.timestamp),currentTime=now();
      if(!Number.isFinite(at)||at<=0||at>currentTime.getTime()||at<currentTime.getTime()-evidence(a,'read').contentRetentionDays*86400000)continue;
      const occurredAt=new Date(at),key={connectionId:conn.id,connectionVersion:conn.version,providerId:raw.id};
      if(typeof raw.id!=='string'||raw.id.length<1||raw.id.length>256)throw new HttpError(502,'Invalid Instagram source identity');
      if(kind==='messages'){
       const sender=raw.from?.id,to=raw.to?.data?.map((v:any)=>v.id)??[];
       if(typeof sender!=='string'||!Array.isArray(to)||to.length!==1)throw new HttpError(502,'Invalid Instagram participants');
       const inbound=!own.includes(sender)&&to.some((v:string)=>own.includes(v)),actorId=inbound?sender:own.includes(sender)?to.find((v:string)=>!own.includes(v)):undefined;
       const participants=(parent as any).participants?.data?.map((v:any)=>v.id)??[];
       if(!actorId||!participants.includes(actorId)||!participants.some((v:string)=>own.includes(v))||own.includes(actorId))throw new HttpError(403,'Instagram message ownership unavailable');
       if(await isDeleted(tx,{workspaceId:conn.workspaceId,platform:'instagram',appId:conn.appId,providerAssetId:conn.providerAccountId,actorId,providerEventId:raw.id,eventKind:'messages',occurredAt,connectionVersion:conn.version}))continue;
       const old=await tx.instagramInteractionMessage.findUnique({where:{connectionId_connectionVersion_providerId:key}});
       if(old?.deleted)continue;if(old&&(old.actorId!==actorId||old.conversationId!==parent.id&&!old.conversationId.startsWith('local:')))throw new HttpError(409,'Instagram message identity changed');
       const row=await tx.instagramInteractionMessage.upsert({where:{connectionId_connectionVersion_providerId:key},create:{workspaceId:conn.workspaceId,...key,conversationId:parent.id,actorId,inbound,text:raw.message,occurredAt,receivedAt:occurredAt},update:raw.message===undefined?{}:{text:raw.message}});items.push(map(a,row,'messages'));
      }else{
       const actorId=raw.from?.id;if(typeof actorId!=='string'||!actorId)throw new HttpError(502,'Instagram comment actor unavailable');
       if(await isDeleted(tx,{workspaceId:conn.workspaceId,platform:'instagram',appId:conn.appId,providerAssetId:conn.providerAccountId,actorId,providerEventId:raw.id,eventKind:'comments',occurredAt,connectionVersion:conn.version}))continue;
       const old=await tx.instagramInteractionComment.findUnique({where:{connectionId_connectionVersion_providerId:key}});if(old?.deleted)continue;if(old&&(old.mediaId!==parent.id||old.actorId!==actorId))throw new HttpError(409,'Instagram comment identity changed');
       const row=await tx.instagramInteractionComment.upsert({where:{connectionId_connectionVersion_providerId:key},create:{workspaceId:conn.workspaceId,...key,mediaId:parent.id,actorId,actorName:raw.username,inbound:!own.includes(actorId),text:raw.text,occurredAt,receivedAt:occurredAt,parentId:raw.parent_id},update:raw.text===undefined?{}:{text:raw.text,actorName:raw.username}});items.push(map(a,row,'comments'));
      }
     }
    },{timeout:15000});
    let next:Record<string,unknown>|null=null;
    if(Number(offset)+selected.length<page.items.length)next={...c,index,offset:Number(offset)+selected.length,parentId:parent.id,anchor:(page.items[0] as any).id};
    else if(page.nextCursor)next={after:c.after,index,parentId:parent.id,childAfter:page.nextCursor};
    else if(Number(index)+1<parents.items.length)next={after:c.after,index:Number(index)+1};
    else if(parents.nextCursor)next={after:parents.nextCursor};
    return{items,nextCursor:next?encodeInboxCursor(scope,next):null,coverage:'verified_account_edges',warnings:['bounded_history_only']};
   });
  },
  async detail(a:ResolvedAsset,value:SourceRef,cursor?:string):Promise<AdapterDetail>{
   const s=source(a,value),cap=s.conversationId?'messages.read':'comments.read';await fresh(a,cap);
   const scope={ctx:a.ctx,asset:a.canonicalKey,version:a.connectionVersion,source:s,kind:'detail'},position=cursor?decodeInboxCursor(scope,cursor):{};
   if(position.at!==undefined&&(typeof position.at!=='string'||!Number.isFinite(Date.parse(position.at))||typeof position.id!=='string'||!/^[0-9a-f-]{36}$/i.test(position.id)))throw new HttpError(400,'Invalid Instagram detail cursor');
   const result=await db.$transaction(async tx=>{
    await fence(tx,a,cap);const row=await target(tx,a,s);
    const rows=s.conversationId?await tx.instagramInteractionMessage.findMany({where:{workspaceId:a.ctx.workspaceId,connectionId:s.connectionId,connectionVersion:a.connectionVersion,conversationId:s.conversationId,actorId:s.participantId,deleted:false,receivedAt:{gte:new Date(now().getTime()-evidence(a,'read').contentRetentionDays*86400000)},...(position.at?{OR:[{occurredAt:{gt:new Date(position.at as string)}},{occurredAt:new Date(position.at as string),id:{gt:position.id as string}}]}:{})},orderBy:[{occurredAt:'asc'},{id:'asc'}],take:26}):[row];
    const items:AdapterDetail['items']=[];for(const r of rows.slice(0,25)){try{await target(tx,a,{...s,sourceRecordId:r.id});items.push({id:r.providerId,text:r.text,occurredAt:r.occurredAt.toISOString(),inbound:r.inbound,deleted:r.deleted});}catch(e){if(!(e instanceof HttpError)||e.statusCode!==404)throw e;}}
    const last=rows[24];return{items,nextCursor:rows.length>25&&last?encodeInboxCursor(scope,{at:last.occurredAt.toISOString(),id:last.id}):null};
   });
   return{...result,officialUrl:null,replyTarget:s.conversationId??s.commentId??null,capabilities:await caps(a)};
  },
  async reply(a:ResolvedAsset,value:SourceRef,text:string,requestKey:string):Promise<SendOutcome>{
   const s=source(a,value),cap=s.conversationId?'messages.reply':'comments.reply';
   if(typeof text!=='string'||!text.trim()||text.length>(s.conversationId?2000:Math.min(8000,verifiedCommentLimit))||!Number.isSafeInteger(verifiedCommentLimit)||verifiedCommentLimit<1)throw new HttpError(400,'Invalid Instagram reply');
   await fresh(a,cap);await db.$transaction(async tx=>{await fence(tx,a,cap);await target(tx,a,s);});
   return access.withAccess(a.ctx,a.accountId,cap,async(current,token)=>{
    if(current.connectionVersion!==a.connectionVersion||current.appNamespace!==a.appNamespace||current.sourceRef?.connectionId!==s.connectionId)throw new HttpError(409,'Instagram connection changed');
    const g=graph(a,token);await remoteTarget(a,s,g);await fresh(a,cap);
    const row=await db.$transaction(async tx=>{
     await fence(tx,a,cap);const r=await target(tx,a,s);
     if(s.conversationId){
      const last=await tx.instagramInteractionMessage.findFirst({where:{workspaceId:a.ctx.workspaceId,connectionId:s.connectionId,connectionVersion:a.connectionVersion,conversationId:s.conversationId,actorId:s.participantId,inbound:true,deleted:false},orderBy:{occurredAt:'desc'}});
      const age=last?now().getTime()-last.occurredAt.getTime():NaN;
      if(!Number.isFinite(age)||age<0||age>evidence(a,'send').replyWindowMs)throw new HttpError(409,'Instagram reply window unavailable');
      await target(tx,a,{...s,sourceRecordId:last!.id});
     }return r;
    });
    return executor.execute({asset:a,requestKey,kind:s.conversationId?'message':'comment',targetId:s.conversationId?s.participantId!:row.providerId,text},async()=>{
     // Final local policy/window/connection check immediately precedes the one provider operation.
     await fresh(a,cap);await db.$transaction(async tx=>{await fence(tx,a,cap);await target(tx,a,s);
      if(s.conversationId){const last=await tx.instagramInteractionMessage.findFirst({where:{connectionId:s.connectionId,connectionVersion:a.connectionVersion,workspaceId:a.ctx.workspaceId,conversationId:s.conversationId,actorId:s.participantId,inbound:true,deleted:false},orderBy:{occurredAt:'desc'}});const age=last?now().getTime()-last.occurredAt.getTime():NaN;if(!Number.isFinite(age)||age<0||age>evidence(a,'send').replyWindowMs)throw new HttpError(409,'Instagram reply window unavailable');}
     });
     return s.conversationId?g.sendMessage(s.participantId!,text):g.replyComment(row.providerId,text);
    });
   });
  },
  async pendingSend(a:ResolvedAsset,requestKey:string){
   const s=source(a,a.sourceRef!),c=await db.instagramManagementConnection.findFirst({where:{id:s.connectionId,workspaceId:a.ctx.workspaceId,appId:a.appNamespace},select:{scopes:true}}),cap=c?.scopes.includes('instagram_business_manage_comments')?'comments.read':'messages.read';await fresh(a,cap);
   const row=await db.$transaction(async tx=>{await fence(tx,a,cap);return tx.instagramInteractionSendAttempt.findFirst({where:{workspaceId:a.ctx.workspaceId,connectionId:s.connectionId,connectionVersion:a.connectionVersion,requestKey},select:{requestKey:true,status:true,diagnosticId:true,createdAt:true}});});return row?{...row,createdAt:row.createdAt.toISOString()}:null;
  },
  async normalizeVerifiedEvent(ids:string[],a:ResolvedAsset){
   if(ids.length>50)throw new HttpError(400,'Instagram event batch too large');const s=source(a,a.sourceRef!),items:VerifiedItem[]=[];
   await requireInboxAccess(db,a.ctx,'read');
   for(const kind of ['messages','comments'] as const){
    const where={id:{in:ids},workspaceId:a.ctx.workspaceId,connectionId:s.connectionId,connectionVersion:a.connectionVersion};
    const count=kind==='messages'?await db.instagramInteractionMessage.count({where}):await db.instagramInteractionComment.count({where});if(!count)continue;
    await fresh(a,kind==='messages'?'messages.read':'comments.read');await db.$transaction(async tx=>{
    await fence(tx,a,kind==='messages'?'messages.read':'comments.read');const where={id:{in:ids},workspaceId:a.ctx.workspaceId,connectionId:s.connectionId,connectionVersion:a.connectionVersion,deleted:false};
    const rows=kind==='messages'?await tx.instagramInteractionMessage.findMany({where,take:50}):await tx.instagramInteractionComment.findMany({where,take:50});
    for(const row of rows){const item=map(a,row,kind);try{await target(tx,a,parseInboxSource(item.sourceRef,'instagram'));items.push(item);}catch(error){if(!(error instanceof HttpError)||error.statusCode!==404)throw error;}}
   });}
   return items;
  }
 };
}
export type InstagramManagementEngagement=ReturnType<typeof createInstagramManagementEngagement>;
