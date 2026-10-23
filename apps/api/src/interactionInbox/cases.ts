import {Prisma,type PrismaClient} from '@prisma/client';import {z} from 'zod';
import {HttpError} from '../utils/errors';import {isPlatformAdmin} from '../utils/platformAdmin';
import type {InboxAccess,InboxDb} from './access';import type {Scope,CaseDto} from './types';import {createHash} from 'node:crypto';
import {safeInboxAvatarUrl} from './directory';
import {parseInboxSource} from './source';
import {findInstagramReplyReceipt} from '../instagramManagement/replyReceipts';
export async function presentInboxCase(db:InboxDb,ctx:Scope,id:string,accountId:string,observedInboundAt?:Date):Promise<CaseDto>{
 const c=await db.interactionCase.findFirstOrThrow({where:{id,workspaceId:ctx.workspaceId},include:{asset:true,customer:{include:{identities:true}},tags:{where:{tag:{deletedAt:null}},include:{tag:true}},receipts:{where:{userId:ctx.userId}}}}),r=c.receipts[0];
 const account=await db.socialAccount.findFirst({where:{id:accountId,workspaceId:ctx.workspaceId,platform:c.asset.platform as any,providerAccountId:c.asset.providerAssetId},select:{displayName:true,avatarUrl:true}});
 const source=c.sourceRef as Record<string,unknown>;let replied=false;
 const identity=c.customer?.identities.find(i=>i.assetId===c.assetId&&i.platform===c.asset.platform&&i.appNamespace===c.asset.appNamespace);
 const customerAvatarUrl=safeInboxAvatarUrl(identity?.avatarUrl);let accountAvatarUrl=safeInboxAvatarUrl(account?.avatarUrl);
 if(!accountAvatarUrl&&c.asset.platform==='facebook'&&typeof source.managedPageId==='string'){const page=await db.facebookManagedPage.findFirst({where:{id:source.managedPageId,pageId:c.asset.providerAssetId,connectionId:typeof source.connectionId==='string'?source.connectionId:undefined,connection:{workspaceId:ctx.workspaceId,appId:c.asset.appNamespace,version:c.asset.connectionVersion,status:'active'}},select:{avatarUrl:true}});accountAvatarUrl=safeInboxAvatarUrl(page?.avatarUrl);}
 if(c.kind==='comments'&&c.asset.platform==='facebook'&&typeof source.commentId==='string'&&typeof source.managedPageId==='string'&&typeof source.connectionId==='string'&&typeof source.connectionVersion==='number')replied=!!await db.facebookInteractionSendAttempt.findFirst({where:{managedPageId:source.managedPageId,connectionVersion:source.connectionVersion,status:'sent',providerId:{not:null},targetHash:createHash('sha256').update(JSON.stringify(['comment',source.commentId])).digest('hex'),...(c.lastInboundAt?{createdAt:{gte:c.lastInboundAt}}:{}),page:{connectionId:source.connectionId,connection:{workspaceId:ctx.workspaceId,appId:c.asset.appNamespace}}},select:{id:true}});
 if(c.kind==='messages'&&c.asset.platform==='facebook'&&typeof source.participantId==='string'&&source.participantId.length>0&&typeof source.conversationId==='string'&&source.conversationId.length>0&&typeof source.managedPageId==='string'&&source.managedPageId===c.asset.facebookManagedPageId&&typeof source.connectionId==='string'&&source.connectionVersion===c.asset.connectionVersion){
  const cutoff=observedInboundAt&&Number.isFinite(observedInboundAt.getTime())&&observedInboundAt.getTime()<=Date.now()&&(!c.lastInboundAt||observedInboundAt>c.lastInboundAt)?observedInboundAt:c.lastInboundAt;
  if(cutoff){
   const targetHash=createHash('sha256').update(JSON.stringify(['message',source.participantId])).digest('hex');
   // Controlled retries copy the old receipt into a newer row. Only its first
   // occurrence can establish a reply; never let a replay answer a newer inbound.
   const rows=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`
    SELECT s.id FROM facebook_interaction_send_attempts s
    JOIN facebook_managed_pages p ON p.id=s."managedPageId"
    JOIN facebook_management_connections g ON g.id=p."connectionId"
    WHERE s."managedPageId"::text=${source.managedPageId} AND p."connectionId"::text=${source.connectionId}
     AND p."pageId"=${c.asset.providerAssetId} AND p.active AND g."workspaceId"=${ctx.workspaceId}::uuid
     AND g."appId"=${c.asset.appNamespace} AND g.status='active' AND g.version=${c.asset.connectionVersion}
     AND s."connectionVersion"=${c.asset.connectionVersion} AND s."targetHash"=${targetHash}
     AND s.status='sent' AND s."providerId" IS NOT NULL AND s."providerId"<>'' AND s."createdAt">${cutoff}
     AND NOT EXISTS(SELECT 1 FROM facebook_interaction_send_attempts original
      WHERE original."managedPageId"=s."managedPageId" AND original."providerId"=s."providerId"
       AND (original."createdAt",original.id)<(s."createdAt",s.id)) LIMIT 1`);
   replied=rows.length>0;
  }
 }
 if(c.asset.platform==='instagram'&&c.asset.active&&(c.kind==='comments'||c.kind==='messages')){
  let s;try{s=parseInboxSource(c.sourceRef,'instagram');}catch{}
  const targetId=c.kind==='messages'?s?.participantId:s?.commentId;
  if(s&&targetId&&s.instagramAccountId===accountId&&s.connectionId===c.asset.instagramConnectionId&&s.connectionVersion===c.asset.connectionVersion){
   const at=new Date(),where={workspaceId:ctx.workspaceId,connectionId:s.connectionId,connectionVersion:s.connectionVersion,deleted:false,occurredAt:{lte:at}};
   const root=c.kind==='messages'?await db.instagramInteractionMessage.findFirst({where:{...where,...(s.sourceRecordId?{id:s.sourceRecordId}:{}),actorId:s.participantId,conversationId:s.conversationId}}):await db.instagramInteractionComment.findFirst({where:{...where,...(s.sourceRecordId?{id:s.sourceRecordId}:{}),providerId:s.commentId,mediaId:s.mediaId,inbound:true}});
   const latest=c.kind==='messages'?await db.instagramInteractionMessage.findFirst({where:{...where,actorId:s.participantId,inbound:true},orderBy:{occurredAt:'desc'},select:{occurredAt:true}}):root;
   const times=[c.lastInboundAt,observedInboundAt,latest?.occurredAt].filter((v):v is Date=>!!v&&Number.isFinite(v.getTime())&&v<=at),cutoff=times.length?new Date(Math.max(...times.map(v=>v.getTime()))):null;
   if(root&&cutoff)replied=!!await findInstagramReplyReceipt(db,{workspaceId:ctx.workspaceId,accountId,appId:c.asset.appNamespace,providerAccountId:c.asset.providerAssetId,connectionId:s.connectionId,connectionVersion:s.connectionVersion,kind:c.kind==='messages'?'message':'comment',targetId,after:cutoff,before:at});
  }
 }
 return{id:c.id,kind:c.kind as CaseDto['kind'],accountId,customerId:c.customerId,customerName:identity?.displayName??identity?.username??null,sourceLabel:c.asset.platform+' · '+(account?.displayName??accountId),status:c.status,replied,customerAvatarUrl,accountAvatarUrl,version:c.version,lastInboundAt:c.lastInboundAt?.toISOString()??null,unread:!!c.lastInboundAt&&(!r||r.lastReadAt<c.lastInboundAt||r.lastReadKey!==c.lastInboundKey),tags:c.tags.map(({tag})=>({id:tag.id,kind:tag.kind,name:tag.name,color:tag.color,version:tag.version})),assigneeId:c.assigneeId,sentiment:c.sentiment};
}
export function createInboxCases({db,access,setCaseTags}:{db:PrismaClient;access:InboxAccess;setCaseTags?:(ctx:Scope,id:string,ids:string[],version:number)=>Promise<void>}){
 async function getCaseDto(ctx:Scope,id:string){const {asset}=await access.resolveCase(ctx,id);return presentInboxCase(db,ctx,id,asset.accountId);}
 async function updateCase(ctx:Scope,id:string,input:unknown){
  const v=z.object({status:z.enum(['pending','in_progress','resolved']).optional(),assigneeId:z.string().uuid().nullable().optional(),sentiment:z.enum(['positive','neutral','negative']).nullable().optional(),version:z.number().int().positive()}).strict().parse(input);
  await access.resolveCase(ctx,id,'write');
  await access.write(ctx,async tx=>{
   const {asset}=await access.resolveCase(ctx,id,'write',tx);
   if(v.assigneeId){const member=await tx.workspaceMember.findFirst({where:{workspaceId:ctx.workspaceId,userId:v.assigneeId,status:'active'},include:{user:{select:{email:true}}}});if(!member||!isPlatformAdmin(member.user.email))throw new HttpError(400,'Assignee unavailable');}
   const updated=await tx.interactionCase.updateMany({where:{id,workspaceId:ctx.workspaceId,version:v.version},data:{...v,version:{increment:1}}});if(updated.count!==1)throw new HttpError(409,'Interaction changed');
   await tx.interactionAudit.create({data:{workspaceId:ctx.workspaceId,actorId:ctx.userId,action:'case.update',targetId:id,result:'ok'}});
  });return getCaseDto(ctx,id);
 }
 async function markRead(ctx:Scope,id:string,input:unknown){
  const v=z.object({eventAt:z.string().datetime(),eventKey:z.string().min(1).max(512),version:z.number().int().positive()}).strict().parse(input);
  await access.resolveCase(ctx,id);
  return access.write(ctx,async tx=>{
   const {row}=await access.resolveCase(ctx,id,'read',tx);if(row.version!==v.version)throw new HttpError(409,'Interaction changed');
   const item=await tx.interactionItem.findFirst({where:{caseId:id,workspaceId:ctx.workspaceId,providerEventId:v.eventKey,direction:'inbound',occurredAt:new Date(v.eventAt)}});if(!item)throw new HttpError(400,'Unknown read position');
   const old=await tx.readReceipt.findUnique({where:{caseId_userId:{caseId:id,userId:ctx.userId}}});
   if(old&&old.lastReadAt>item.occurredAt)return old;
   if(old&&old.lastReadAt.getTime()===item.occurredAt.getTime()&&row.lastInboundKey!==v.eventKey)return old;
   return tx.readReceipt.upsert({where:{caseId_userId:{caseId:id,userId:ctx.userId}},create:{workspaceId:ctx.workspaceId,caseId:id,userId:ctx.userId,lastReadAt:item.occurredAt,lastReadKey:v.eventKey},update:{lastReadAt:item.occurredAt,lastReadKey:v.eventKey,version:{increment:1}}});
  });
 }
 async function batchCases(ctx:Scope,operations:unknown){
  const values=z.array(z.object({id:z.string().uuid(),version:z.number().int().positive(),status:z.enum(['pending','in_progress','resolved']).optional(),tagIds:z.array(z.string().uuid()).max(10).optional()}).strict().refine(v=>(v.status!==undefined)!==(v.tagIds!==undefined),'Choose exactly one local operation')).min(1).max(50).parse(operations);
  const results=[];for(const v of values){try{if(v.tagIds){if(!setCaseTags)throw new HttpError(409,'Tag operation unavailable');await setCaseTags(ctx,v.id,v.tagIds,v.version);}else await updateCase(ctx,v.id,{version:v.version,status:v.status});results.push({id:v.id,status:'ok'});}catch(e){results.push({id:v.id,status:e instanceof HttpError&&e.statusCode===409?'conflict':'unavailable'});}}return results;
 }
 return{getCaseDto,updateCase,markRead,batchCases};
}
