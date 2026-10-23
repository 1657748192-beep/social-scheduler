import {Prisma,type PrismaClient} from '@prisma/client';
import {liveInboxCaseSql,inboxSourceAlive} from './sourceLifetime';
import {parseInboxSource} from './source';
import {z} from 'zod';
import {createLiveInboxPolicy,type LiveInboxPolicy} from './livePolicy';
import type {MetaDeletionAsset} from './deletion';
import {HttpError} from '../utils/errors';
import {expireInstagramRecordingGrants,purgeClosedInstagramRecordingGrants} from '../instagramManagement/recordingGrantLifecycle';
export type MetaSourcePhase='raw'|'messages'|'comments'|'threads'|'sends';

const retentionAsset=z.object({workspaceId:z.string().uuid(),platform:z.literal('instagram'),appId:z.string().regex(/^\d{1,256}$/),providerAssetId:z.string().regex(/^\d{1,256}$/),connectionId:z.string().uuid(),connectionVersion:z.number().int().positive()}).strict();
/** Independent source-store maintenance only; not registered until derived cleanup is wired. */
export function createMetaSourceRetention({db,policy}:{db:PrismaClient;policy:LiveInboxPolicy}){
 return{async pruneInstagram(asset:MetaDeletionAsset,now:Date,limit:number,phase:'auto'|Exclude<MetaSourcePhase,'threads'>='auto'):Promise<number>{
  const parsed=retentionAsset.safeParse(asset);
  if(!parsed.success||!Number.isFinite(now.getTime())||!Number.isInteger(limit)||limit<1||limit>50||!['auto','raw','messages','comments','sends'].includes(phase))throw new HttpError(400,'Invalid Meta retention batch');
  const a=parsed.data,bounds=policy.retentionForAsset(a),rawCutoff=new Date(now.getTime()-bounds.rawRetentionDays*86400000),bodyCutoff=new Date(now.getTime()-bounds.contentRetentionDays*86400000);
  return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${a.connectionId}::uuid FOR UPDATE`;
   const connection=await tx.instagramManagementConnection.findFirst({where:{id:a.connectionId,workspaceId:a.workspaceId,appId:a.appId,providerAccountId:a.providerAssetId,version:{gte:a.connectionVersion}},select:{id:true}});
   if(!connection)throw new HttpError(404,'Meta retention scope unavailable');
   const grants=await expireInstagramRecordingGrants(tx,limit,now,a);if(grants)return grants;
   const scope={workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:{lte:a.connectionVersion}};
   if(phase==='sends'){
    const where={...scope,createdAt:{lt:bodyCutoff},targetHash:{not:'deleted'}},rows=await tx.instagramInteractionSendAttempt.findMany({where,take:limit,select:{id:true}});return(await tx.instagramInteractionSendAttempt.updateMany({where:{...where,id:{in:rows.map(v=>v.id)}},data:{targetHash:'deleted',payloadHash:'deleted',providerId:null,diagnosticId:null,status:'unknown'}})).count;
   }
   let purged=0;
   if(phase==='auto'||phase==='raw'){
    const rawWhere={...scope,receivedAt:{lt:rawCutoff}},raw=await tx.instagramInteractionEvent.findMany({where:rawWhere,take:limit,orderBy:{id:'asc'},select:{id:true}});
    if(raw.length)purged+=(await tx.instagramInteractionEvent.deleteMany({where:{...rawWhere,id:{in:raw.map(v=>v.id)}}})).count;
    if(phase==='raw'||purged===limit)return purged;
   }
   // Both clocks bound content lifetime; a freshly fetched old body earns no new lease.
   const bodyWhere={...scope,OR:[{receivedAt:{lt:bodyCutoff}},{occurredAt:{lt:bodyCutoff}}]};
   if(phase==='auto'||phase==='messages'){
    const messages=await tx.instagramInteractionMessage.findMany({where:bodyWhere,take:limit-purged,orderBy:{id:'asc'},select:{id:true}});
    if(messages.length)purged+=(await tx.instagramInteractionMessage.deleteMany({where:{...bodyWhere,id:{in:messages.map(v=>v.id)}}})).count;
    if(phase==='messages'||purged===limit)return purged;
   }
   const comments=await tx.instagramInteractionComment.findMany({where:bodyWhere,take:limit-purged,orderBy:{id:'asc'},select:{id:true}});
   if(comments.length)purged+=(await tx.instagramInteractionComment.deleteMany({where:{...bodyWhere,id:{in:comments.map(v=>v.id)}}})).count;
   return purged;
  },{timeout:15000});
 },async pruneFacebook(asset:MetaDeletionAsset,now:Date,limit:number,phase:MetaSourcePhase):Promise<number>{
  const parsed=retentionAsset.extend({platform:z.literal('facebook')}).safeParse(asset);
  if(!parsed.success||!Number.isFinite(now.getTime())||!Number.isInteger(limit)||limit<1||limit>50||!['raw','messages','comments','threads','sends'].includes(phase))throw new HttpError(400,'Invalid Meta retention batch');
  const a=parsed.data,bounds=policy.retentionForAsset(a),rawCutoff=new Date(now.getTime()-bounds.rawRetentionDays*86400000),bodyCutoff=new Date(now.getTime()-bounds.contentRetentionDays*86400000);
  return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM facebook_management_connections WHERE id=${a.connectionId}::uuid FOR UPDATE`;
   const page=await tx.facebookManagedPage.findFirst({where:{connectionId:a.connectionId,pageId:a.providerAssetId,connection:{workspaceId:a.workspaceId,appId:a.appId,version:{gte:a.connectionVersion}}},select:{id:true}});if(!page)throw new HttpError(404,'Meta retention scope unavailable');
   const scope={managedPageId:page.id,OR:[{connectionVersion:null},{connectionVersion:{lte:a.connectionVersion}}]};
   if(phase==='raw'){
    const where={...scope,receivedAt:{lt:rawCutoff}},rows=await tx.facebookInteractionEvent.findMany({where,take:limit,orderBy:{id:'asc'},select:{id:true}});return(await tx.facebookInteractionEvent.deleteMany({where:{...where,id:{in:rows.map(v=>v.id)}}})).count;
   }
   if(phase==='messages'||phase==='comments'){
    const where={...scope,AND:[{OR:[{receivedAt:{lt:bodyCutoff}},{occurredAt:{lt:bodyCutoff}}]}]},rows=phase==='messages'?await tx.facebookInteractionMessage.findMany({where,take:limit,orderBy:{id:'asc'},select:{id:true}}):await tx.facebookInteractionComment.findMany({where,take:limit,orderBy:{id:'asc'},select:{id:true}}),ids=rows.map(v=>v.id);
    return phase==='messages'?(await tx.facebookInteractionMessage.deleteMany({where:{...where,id:{in:ids}}})).count:(await tx.facebookInteractionComment.deleteMany({where:{...where,id:{in:ids}}})).count;
   }
   if(phase==='sends'){
    const where={...scope,createdAt:{lt:bodyCutoff},payloadHash:{not:'deleted'}},rows=await tx.facebookInteractionSendAttempt.findMany({where,take:limit,select:{id:true}});return(await tx.facebookInteractionSendAttempt.updateMany({where:{...where,id:{in:rows.map(v=>v.id)}},data:{targetHash:'deleted',payloadHash:'deleted',providerId:null,diagnosticId:null,errorCode:null,status:'unknown'}})).count;
   }
   const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT t.id FROM facebook_interaction_threads t WHERE t."managedPageId"=${page.id}::uuid AND (t."connectionVersion" IS NULL OR t."connectionVersion"<=${a.connectionVersion}) AND t."receivedAt"<${bodyCutoff} AND t."updatedAt"<${bodyCutoff} AND NOT EXISTS(SELECT 1 FROM facebook_interaction_messages m WHERE m."managedPageId"=t."managedPageId" AND m."participantId"=t."participantId") ORDER BY t.id LIMIT ${limit}`;
   return(await tx.facebookInteractionThread.deleteMany({where:{...scope,id:{in:rows.map(v=>v.id)},receivedAt:{lt:bodyCutoff},updatedAt:{lt:bodyCutoff}}})).count;
  },{timeout:15000});
 }};
}
export function createInboxRetention({db,policy=createLiveInboxPolicy([])}:{db:PrismaClient;policy?:LiveInboxPolicy}){
 return{async pruneInbox(now:Date,limit:number){
  if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid retention batch');
  return db.$transaction(async tx=>{
   let changed=await expireInstagramRecordingGrants(tx,limit,now);if(changed>=limit)return changed;
   changed+=await purgeClosedInstagramRecordingGrants(tx,limit-changed,now);if(changed>=limit)return changed;
   const cutoff=new Date(now.getTime()-90*86400000),expired={OR:[{receivedAt:{lt:cutoff}},{occurredAt:{lt:cutoff}}]};
   const rows=await tx.interactionItem.findMany({where:expired,take:limit-changed,select:{id:true}});
   changed+=(await tx.interactionItem.deleteMany({where:{...expired,id:{in:rows.map(r=>r.id)}}})).count;if(changed>=limit)return changed;
   const [candidate]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT c.id FROM "InteractionCase" c WHERE NOT (${liveInboxCaseSql(now)}) ORDER BY c.id LIMIT 1 FOR UPDATE OF c SKIP LOCKED`);
   if(candidate){
    const c=await tx.interactionCase.findUniqueOrThrow({where:{id:candidate.id}}),items=await tx.interactionItem.findMany({where:{workspaceId:c.workspaceId,caseId:c.id},take:limit-changed,orderBy:[{occurredAt:'desc'},{id:'desc'}]});
    const dead:string[]=[];let live:typeof items[number]|undefined;
    for(const item of items){let alive=false;try{if(!item.deleted&&(item.platform==='facebook'||item.platform==='instagram'))alive=await inboxSourceAlive(tx,parseInboxSource(item.sourceRef,item.platform),item.occurredAt,now,policy);}catch{/* Malformed derived references grant no source access. */}if(alive)live??=item;else dead.push(item.id);}
    if(dead.length)changed+=(await tx.interactionItem.deleteMany({where:{workspaceId:c.workspaceId,caseId:c.id,id:{in:dead}}})).count;if(changed>=limit)return changed;
    if(live){await tx.interactionCase.update({where:{id:c.id},data:{sourceRef:live.sourceRef as Prisma.InputJsonValue,lastInboundAt:live.direction==='inbound'?live.occurredAt:null,lastInboundKey:live.direction==='inbound'?live.providerEventId:null,version:{increment:1}}});return changed+1;}
    if(!await tx.interactionItem.count({where:{workspaceId:c.workspaceId,caseId:c.id}})){
     const receipts=await tx.readReceipt.findMany({where:{workspaceId:c.workspaceId,caseId:c.id},take:limit-changed,select:{id:true}});if(receipts.length)changed+=(await tx.readReceipt.deleteMany({where:{id:{in:receipts.map(r=>r.id)},caseId:c.id}})).count;if(changed>=limit)return changed;
     const tags=await tx.interactionCaseTag.findMany({where:{workspaceId:c.workspaceId,caseId:c.id},take:limit-changed,select:{id:true}});if(tags.length)changed+=(await tx.interactionCaseTag.deleteMany({where:{id:{in:tags.map(r=>r.id)},caseId:c.id}})).count;if(changed>=limit)return changed;
     changed+=(await tx.interactionCase.deleteMany({where:{id:c.id,workspaceId:c.workspaceId,items:{none:{}},receipts:{none:{}},tags:{none:{}}}})).count;if(changed>=limit)return changed;
    }
   }
   // Preserve the minimum local deletion linkage while notes/tags remain, but
   // expire personal display caches. Never orphan covered notes via a cascade.
   const orphan:Prisma.InteractionIdentityWhereInput={customer:{cases:{none:{}}},OR:[{customer:{notes:{none:{}},tags:{none:{}}}},{displayName:{not:null}},{username:{not:null}},{avatarUrl:{not:null}},{profileUrl:{not:null}}]};
   const identity=await tx.interactionIdentity.findFirst({where:orphan,orderBy:{id:'asc'},select:{id:true,customerId:true}});
   if(identity){await tx.$queryRaw`SELECT id FROM "InteractionCustomer" WHERE id=${identity.customerId}::uuid FOR UPDATE`;
    if(await tx.interactionIdentity.findFirst({where:{...orphan,id:identity.id},select:{id:true}})){
     if(!await tx.customerNote.count({where:{customerId:identity.customerId}})&&!await tx.interactionCustomerTag.count({where:{customerId:identity.customerId}}))changed+=(await tx.interactionIdentity.deleteMany({where:{id:identity.id,customer:{cases:{none:{}},notes:{none:{}},tags:{none:{}}}}})).count;
     else changed+=(await tx.interactionIdentity.updateMany({where:{id:identity.id,customer:{cases:{none:{}}}},data:{displayName:null,username:null,avatarUrl:null,profileUrl:null}})).count;
    }
   }
   return changed;
  },{timeout:15000});
 }};
}
