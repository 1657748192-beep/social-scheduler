import {createHash,randomUUID} from 'node:crypto';
import type {PrismaClient,Prisma,InstagramManagementConnection} from '@prisma/client';
import {z} from 'zod';
import {HttpError} from '../utils/errors';
import {isPlatformAdmin} from '../utils/platformAdmin';
import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';
import type {VerifiedInstagramEvent,InstagramEventClaim,InstagramSourceSubject} from './types';
const id=z.string().min(1).max(256);
const schema=z.object({accountId:id,field:z.enum(['comments','messages']),eventId:id,senderId:id.optional(),recipientId:id.optional(),mediaId:id.optional(),text:z.string().max(10000).optional(),username:z.string().max(256).optional(),timestamp:z.number().int().nonnegative().safe(),isEcho:z.boolean(),deleted:z.boolean()}).strict();
export const instagramSourceTime=(timestamp:number,now:Date)=>new Date(timestamp>0&&timestamp<=now.getTime()&&timestamp<=8640000000000000?timestamp:0);
export function createInstagramManagementReceptionStore({db,appId,enabled=false,policy,isDeleted}:{db:PrismaClient;appId:string;enabled?:boolean;policy:LiveInboxPolicy;isDeleted:(tx:Prisma.TransactionClient,subject:InstagramSourceSubject)=>Promise<boolean>}){
 async function fenceConnection(tx:Prisma.TransactionClient,connectionId:string){
  const c=await tx.instagramManagementConnection.findUnique({where:{id:connectionId},select:{userId:true,workspaceId:true}});
  if(c)await tx.$queryRaw`SELECT id FROM workspace_members WHERE workspace_id=${c.workspaceId}::uuid AND user_id=${c.userId}::uuid FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${connectionId}::uuid FOR UPDATE`;
 }
 function policyAllows(c:InstagramManagementConnection){try{policy.requireAsset({workspaceId:c.workspaceId,platform:'instagram',appId,providerAssetId:c.providerAccountId},'read');return true;}catch{return false;}}
 async function current(tx:Prisma.TransactionClient,connectionId:string,version:number,event:VerifiedInstagramEvent,now:Date){
  const c=await tx.instagramManagementConnection.findFirst({where:{id:connectionId,appId,status:'active',version,notificationsEnabled:true}});
  if(!c||!c.tokenEncrypted||c.expiresAt&&c.expiresAt<=now||!policyAllows(c)||![c.providerAccountId,c.providerUserId].includes(event.accountId)||!c.subscribedFields.includes(event.field)||!c.scopes.includes('instagram_business_basic')||!c.scopes.includes(event.field==='messages'?'instagram_business_manage_messages':'instagram_business_manage_comments'))return null;
  const account=await tx.socialAccount.findFirst({where:{workspaceId:c.workspaceId,platform:'instagram',providerAccountId:c.providerAccountId,status:'active'},select:{id:true}});
  const owner=await tx.workspaceMember.findFirst({where:{workspaceId:c.workspaceId,userId:c.userId,status:'active',role:{in:['owner','admin']}},include:{user:{select:{email:true}}}});
  if(!account||!owner||!isPlatformAdmin(owner.user.email))return null;
  const own=[c.providerAccountId,c.providerUserId];
  if(event.field==='messages'&&(!event.senderId||!event.recipientId||(!own.includes(event.senderId)&&!own.includes(event.recipientId))||own.includes(event.senderId)&&own.includes(event.recipientId)))return null;
  if(event.field==='comments'&&(!event.mediaId||!event.senderId&&!event.deleted))return null;
  const actorId=event.field==='messages'?(own.includes(event.senderId!)?event.recipientId:event.senderId):event.senderId;
  if(await isDeleted(tx,{workspaceId:c.workspaceId,platform:'instagram',appId,providerAssetId:c.providerAccountId,actorId,providerEventId:event.eventId,occurredAt:instagramSourceTime(event.timestamp,now),connectionVersion:version}))return null;
  return{c,actorId};
 }
 return{
  async enqueue(input:VerifiedInstagramEvent[]){
   if(!enabled)return;const events=z.array(schema).max(50).parse(input) as VerifiedInstagramEvent[];
   await db.$transaction(async tx=>{
    for(const event of events){
     const candidates=(await tx.instagramManagementConnection.findMany({where:{appId,status:'active',notificationsEnabled:true,OR:[{providerAccountId:event.accountId},{providerUserId:event.accountId}]},take:51})).filter(policyAllows);
     if(candidates.length!==1)continue;const chosen=candidates[0];
     await fenceConnection(tx,chosen.id);
     const allowed=await current(tx,chosen.id,chosen.version,event,new Date());if(!allowed)continue;
     const eventKey=JSON.stringify([event.field,event.eventId,event.deleted,event.timestamp]);
     await tx.instagramInteractionEvent.createMany({skipDuplicates:true,data:[{workspaceId:chosen.workspaceId,connectionId:chosen.id,connectionVersion:chosen.version,eventKey,payload:JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue}]});
    }
   },{timeout:20000});
  },
  async claimBatch(now:Date,limit:number):Promise<InstagramEventClaim[]>{
   if(!enabled)return[];if(!Number.isInteger(limit)||limit<1||limit>50)throw new HttpError(400,'Invalid reception batch');
   return db.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT e.id FROM "InstagramInteractionEvent" e JOIN "InstagramManagementConnection" c ON c.id=e."connectionId" AND c."workspaceId"=e."workspaceId" WHERE c."appId"=${appId} AND e."receivedAt">=${new Date(now.getTime()-7*86400000)} AND e.attempts<8 AND ((e.status='pending' AND e."nextAttemptAt"<=${now}) OR (e.status='processing' AND e."leaseExpiresAt"<=${now})) ORDER BY e."receivedAt",e.id LIMIT ${limit} FOR UPDATE OF e SKIP LOCKED`;
    const claims:InstagramEventClaim[]=[];
    for(const {id} of rows){const claimToken=randomUUID(),row=await tx.instagramInteractionEvent.update({where:{id},data:{status:'processing',claimToken,leaseExpiresAt:new Date(now.getTime()+30000),attempts:{increment:1}}});claims.push({id,workspaceId:row.workspaceId,connectionId:row.connectionId,connectionVersion:row.connectionVersion,claimToken,payload:row.payload});}
    return claims;
   });
  },
  async processClaim(claim:InstagramEventClaim,now:Date){
   if(!enabled)return;
   await db.$transaction(async tx=>{
    await fenceConnection(tx,claim.connectionId);
    await tx.$queryRaw`SELECT id FROM "InstagramInteractionEvent" WHERE id=${claim.id}::uuid FOR UPDATE`;
    const row=await tx.instagramInteractionEvent.findFirst({where:{id:claim.id,workspaceId:claim.workspaceId,connectionId:claim.connectionId,connectionVersion:claim.connectionVersion,status:'processing',claimToken:claim.claimToken,leaseExpiresAt:{gt:now},receivedAt:{gte:new Date(now.getTime()-7*86400000)}}});if(!row)return;
    const event=schema.parse(row.payload) as VerifiedInstagramEvent,allowed=await current(tx,row.connectionId,row.connectionVersion,event,now);if(!allowed)return;
    const {c,actorId}=allowed,key={connectionId:c.id,connectionVersion:c.version,providerId:event.eventId},occurredAt=instagramSourceTime(event.timestamp,now);
    if(event.field==='messages'){
     const existing=await tx.instagramInteractionMessage.findUnique({where:{connectionId_connectionVersion_providerId:key}});
     if(existing?.deleted&&!event.deleted)return;
     if(existing&&actorId&&existing.actorId!==actorId)throw new HttpError(409,'Received sender identity changed');
     if(!actorId)return;
     const inbound=!event.isEcho&&[c.providerAccountId,c.providerUserId].includes(event.recipientId!)&&![c.providerAccountId,c.providerUserId].includes(event.senderId!);
     const conversationId='local:'+createHash('sha256').update(JSON.stringify([c.id,c.version,actorId])).digest('hex');
     await tx.instagramInteractionMessage.upsert({where:{connectionId_connectionVersion_providerId:key},create:{workspaceId:c.workspaceId,...key,conversationId,actorId,inbound,text:event.deleted?null:event.text,occurredAt,receivedAt:row.receivedAt,deleted:event.deleted},update:event.deleted?{deleted:true,text:null}:event.text===undefined?{}:{text:event.text}});
    }else{
     const existing=await tx.instagramInteractionComment.findUnique({where:{connectionId_connectionVersion_providerId:key}});
     if(existing?.deleted&&!event.deleted)return;
     if(existing&&actorId&&existing.actorId&&existing.actorId!==actorId)throw new HttpError(409,'Received sender identity changed');
     await tx.instagramInteractionComment.upsert({where:{connectionId_connectionVersion_providerId:key},create:{workspaceId:c.workspaceId,...key,mediaId:event.mediaId!,actorId:actorId??null,actorName:event.username,inbound:!actorId||![c.providerAccountId,c.providerUserId].includes(actorId),text:event.deleted?null:event.text,occurredAt,receivedAt:row.receivedAt,deleted:event.deleted},update:event.deleted?{deleted:true,text:null}:event.text===undefined?{}:{text:event.text,actorName:event.username}});
    }
   },{timeout:15000});
  },
  async finishClaim(id:string,claimToken:string){if(!enabled)return;await db.instagramInteractionEvent.updateMany({where:{id,claimToken,status:'processing',connection:{appId}},data:{status:'processed',processedAt:new Date(),claimToken:null,leaseExpiresAt:null,payload:{processed:true}}});},
  async failClaim(id:string,claimToken:string){
   if(!enabled)return;const row=await db.instagramInteractionEvent.findFirst({where:{id,claimToken,status:'processing',connection:{appId}}});if(!row)return;
   await db.instagramInteractionEvent.updateMany({where:{id,claimToken,status:'processing',attempts:row.attempts,connection:{appId}},data:{status:row.attempts>=8?'dead':'pending',claimToken:null,leaseExpiresAt:null,nextAttemptAt:new Date(Date.now()+Math.min(3600000,1000*2**row.attempts)),...(row.attempts>=8?{payload:{discarded:true}}:{})}});
  },
  async prune(now:Date){const cutoff=new Date(now.getTime()-7*86400000),rows=await db.instagramInteractionEvent.findMany({where:{receivedAt:{lt:cutoff},connection:{appId}},take:50,select:{id:true}});return(await db.instagramInteractionEvent.deleteMany({where:{id:{in:rows.map(r=>r.id)},receivedAt:{lt:cutoff}}})).count;}
 };
}
