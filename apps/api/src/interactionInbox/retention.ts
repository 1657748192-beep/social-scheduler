import {Prisma,type PrismaClient} from '@prisma/client';
import {liveInboxCaseSql} from './sourceLifetime';
import {z} from 'zod';
import type {LiveInboxPolicy} from './livePolicy';
import type {MetaDeletionAsset} from './deletion';
import {HttpError} from '../utils/errors';

const retentionAsset=z.object({workspaceId:z.string().uuid(),platform:z.literal('instagram'),appId:z.string().regex(/^\d{1,256}$/),providerAssetId:z.string().regex(/^\d{1,256}$/),connectionId:z.string().uuid(),connectionVersion:z.number().int().positive()}).strict();
/** Independent source-store maintenance only; not registered until derived cleanup is wired. */
export function createMetaSourceRetention({db,policy}:{db:PrismaClient;policy:LiveInboxPolicy}){
 return{async pruneInstagram(asset:MetaDeletionAsset,now:Date,limit:number):Promise<number>{
  const parsed=retentionAsset.safeParse(asset);
  if(!parsed.success||!Number.isFinite(now.getTime())||!Number.isInteger(limit)||limit<1||limit>50)throw new HttpError(400,'Invalid Meta retention batch');
  const a=parsed.data,bounds=policy.retentionForAsset(a),rawCutoff=new Date(now.getTime()-bounds.rawRetentionDays*86400000),bodyCutoff=new Date(now.getTime()-bounds.contentRetentionDays*86400000);
  return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${a.connectionId}::uuid FOR UPDATE`;
   const connection=await tx.instagramManagementConnection.findFirst({where:{id:a.connectionId,workspaceId:a.workspaceId,appId:a.appId,providerAccountId:a.providerAssetId,version:{gte:a.connectionVersion}},select:{id:true}});
   if(!connection)throw new HttpError(404,'Meta retention scope unavailable');
   const scope={workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:{lte:a.connectionVersion}};
   let purged=0;
   const rawWhere={...scope,receivedAt:{lt:rawCutoff}},raw=await tx.instagramInteractionEvent.findMany({where:rawWhere,take:limit,orderBy:{id:'asc'},select:{id:true}});
   if(raw.length)purged+=(await tx.instagramInteractionEvent.deleteMany({where:{...rawWhere,id:{in:raw.map(v=>v.id)}}})).count;
   if(purged===limit)return purged;
   // Both clocks bound content lifetime; a freshly fetched old body earns no new lease.
   const bodyWhere={...scope,OR:[{receivedAt:{lt:bodyCutoff}},{occurredAt:{lt:bodyCutoff}}]};
   const messages=await tx.instagramInteractionMessage.findMany({where:bodyWhere,take:limit-purged,orderBy:{id:'asc'},select:{id:true}});
   if(messages.length)purged+=(await tx.instagramInteractionMessage.deleteMany({where:{...bodyWhere,id:{in:messages.map(v=>v.id)}}})).count;
   if(purged===limit)return purged;
   const comments=await tx.instagramInteractionComment.findMany({where:bodyWhere,take:limit-purged,orderBy:{id:'asc'},select:{id:true}});
   if(comments.length)purged+=(await tx.instagramInteractionComment.deleteMany({where:{...bodyWhere,id:{in:comments.map(v=>v.id)}}})).count;
   return purged;
  },{timeout:15000});
 }};
}
export function createInboxRetention({db}:{db:PrismaClient}){
 return{async pruneInbox(now:Date,limit:number){
  if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid retention batch');
  const cutoff=new Date(now.getTime()-90*86400000),rows=await db.interactionItem.findMany({where:{receivedAt:{lt:cutoff}},take:limit,select:{id:true}});
  // No new raw-event copies exist. The original receiver still owns its own retention policy.
  const removed=await db.interactionItem.deleteMany({where:{id:{in:rows.map(r=>r.id)},receivedAt:{lt:cutoff}}});
  const dead=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT c.id FROM "InteractionCase" c WHERE NOT (${liveInboxCaseSql(now)}) ORDER BY c.id LIMIT ${limit}`);
  await db.interactionCase.deleteMany({where:{id:{in:dead.map(r=>r.id)}}});
  const stale=await db.interactionCase.findMany({where:{items:{none:{}},lastInboundAt:{lt:cutoff}},take:limit,select:{id:true}});
  await db.interactionCase.deleteMany({where:{id:{in:stale.map(r=>r.id)},items:{none:{}}}});
  // Identity display caches must not outlive their source; manual notes remain local until explicit deletion.
  const identities=await db.interactionIdentity.findMany({where:{customer:{cases:{none:{}}}},take:limit,select:{id:true}});
  await db.interactionIdentity.deleteMany({where:{id:{in:identities.map(i=>i.id)},customer:{cases:{none:{}}}}});
  return removed.count;
 }};
}
