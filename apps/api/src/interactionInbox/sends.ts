import {Prisma,type PrismaClient} from '@prisma/client';import {z} from 'zod';import {HttpError} from '../utils/errors';
import type {InboxAccess,InboxDb} from './access';import type {InboxRegistry} from './adapters/registry';import type {Scope,SendOutcome,SourceRef,ResolvedAsset} from './types';
export async function pendingInboxSend(db:InboxDb,ctx:Scope,id:string,source:SourceRef,asset:ResolvedAsset,registry:InboxRegistry){
 const settled=asset.platform==='instagram'?Prisma.sql`EXISTS(SELECT 1 FROM "InstagramInteractionSendAttempt" s JOIN "InstagramManagementConnection" c ON c.id=s."connectionId" WHERE s."workspaceId"=${ctx.workspaceId}::uuid AND s."connectionId"=${source.connectionId}::uuid AND c."appId"=${asset.appNamespace} AND s."connectionVersion"=${asset.connectionVersion} AND s."requestKey"::text=r.result AND s.status IN ('sent','failed'))`:asset.platform==='facebook'&&'managedPageId' in source?Prisma.sql`EXISTS(SELECT 1 FROM facebook_interaction_send_attempts s JOIN facebook_managed_pages p ON p.id=s."managedPageId" JOIN facebook_management_connections c ON c.id=p."connectionId" WHERE c."workspaceId"=${ctx.workspaceId}::uuid AND c.id=${source.connectionId}::uuid AND c."appId"=${asset.appNamespace} AND s."managedPageId"=${source.managedPageId}::uuid AND s."connectionVersion"=${asset.connectionVersion} AND s."requestKey"::text=r.result AND s.status IN ('sent','failed'))`:Prisma.sql`false`;
 // Query unresolved keys, not just the latest reference. A later known outcome
 // must never hide an earlier unknown after verified conversation reconciliation.
 for(let scan=0;scan<50;scan++){
 const refs=await db.$queryRaw<Array<{result:string;createdAt:Date}>>(Prisma.sql`SELECT r.result,r."createdAt" FROM "InteractionAudit" r WHERE r."workspaceId"=${ctx.workspaceId}::uuid AND r."targetId"=${id} AND r.action='reply.reference' AND NOT EXISTS(SELECT 1 FROM "InteractionAudit" a WHERE a."workspaceId"=r."workspaceId" AND a."targetId"=r."targetId" AND a.action='reply.acknowledge' AND a.result=r.result) AND NOT (${settled}) ORDER BY r."createdAt",r.id LIMIT 1`);
 const ref=refs[0];if(!ref)return null;
  if(await db.interactionAudit.findFirst({where:{workspaceId:ctx.workspaceId,targetId:id,action:'reply.acknowledge',result:ref.result}}))continue;
  const attempt=await registry.getInboxAdapter(asset.platform).pendingSend?.(asset,source,ref.result,db);
  if(attempt&&['sent','failed'].includes(attempt.status))continue;
  return{requestKey:ref.result,status:attempt?.status??'pending',diagnosticId:attempt?.diagnosticId??null,createdAt:ref.createdAt.toISOString()};
 }throw new HttpError(409,'Reply state changed repeatedly; verify existing replies first');
}
export function createInboxSends({db,access,registry}:{db:PrismaClient;access:InboxAccess;registry:InboxRegistry}){
 return{async replyToCase(ctx:Scope,id:string,input:unknown):Promise<SendOutcome>{
  const v=z.object({targetId:z.string().min(1).max(512),text:z.string().min(1).max(8000).refine(s=>!!s.trim()),requestKey:z.string().uuid()}).strict().parse(input);
  const {row,asset,source}=await access.resolveCase(ctx,id,'write');
  if(row.kind==='mentions')throw new HttpError(409,'This mention has no verified reply mapping');
  const expected=row.kind==='messages'?source.conversationId:source.commentId;
  if(!expected||expected!==v.targetId)throw new HttpError(404,'Reply target unavailable');
  if(v.text.length>(row.kind==='messages'?2000:8000))throw new HttpError(400,'Reply too long');
  await access.resolveInboxAsset(ctx,asset.accountId,`${row.kind}.reply` as any);
  await access.write(ctx,async tx=>{await tx.$queryRaw`SELECT id FROM "InteractionCase" WHERE id=${id}::uuid FOR UPDATE`;await access.resolveCase(ctx,id,'write',tx);const pending=await pendingInboxSend(tx,ctx,id,source,asset,registry);if(pending&&pending.requestKey!==v.requestKey)throw new HttpError(409,'A previous reply needs official verification');if(!await tx.interactionAudit.findFirst({where:{workspaceId:ctx.workspaceId,targetId:id,action:'reply.reference',result:v.requestKey}}))await tx.interactionAudit.create({data:{workspaceId:ctx.workspaceId,actorId:ctx.userId,action:'reply.reference',targetId:id,result:v.requestKey}});});
  return registry.getInboxAdapter(asset.platform).reply(asset,source,v.text,v.requestKey);
 },async acknowledgeSend(ctx:Scope,id:string,input:unknown){
  const v=z.object({requestKey:z.string().uuid(),confirmed:z.literal(true)}).strict().parse(input);const {source,asset}=await access.resolveCase(ctx,id,'write');
  return access.write(ctx,async tx=>{await tx.$queryRaw`SELECT id FROM "InteractionCase" WHERE id=${id}::uuid FOR UPDATE`;await access.resolveCase(ctx,id,'write',tx);const p=await pendingInboxSend(tx,ctx,id,source,asset,registry);if(!p||p.requestKey!==v.requestKey)throw new HttpError(409,'Pending send changed');if(p.status==='pending'&&Date.now()-Date.parse(p.createdAt)<30000)throw new HttpError(409,'Send still pending');await tx.interactionAudit.create({data:{workspaceId:ctx.workspaceId,actorId:ctx.userId,action:'reply.acknowledge',targetId:id,result:v.requestKey}});return{acknowledged:true};});
 }};
}
