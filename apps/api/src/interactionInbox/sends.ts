import type {PrismaClient} from '@prisma/client';import {z} from 'zod';import {HttpError} from '../utils/errors';
import type {InboxAccess,InboxDb} from './access';import type {InboxRegistry} from './adapters/registry';import type {Scope,SendOutcome,SourceRef} from './types';
export async function pendingInboxSend(db:InboxDb,ctx:Scope,id:string,source:SourceRef){
 const ref=await db.interactionAudit.findFirst({where:{workspaceId:ctx.workspaceId,targetId:id,action:'reply.reference'},orderBy:[{createdAt:'desc'},{id:'desc'}]});if(!ref)return null;
 if(await db.interactionAudit.findFirst({where:{workspaceId:ctx.workspaceId,targetId:id,action:'reply.acknowledge',result:ref.result}}))return null;
 const attempt=await db.facebookInteractionSendAttempt.findUnique({where:{managedPageId_requestKey:{managedPageId:source.managedPageId,requestKey:ref.result}}});
 if(attempt&&['sent','failed'].includes(attempt.status))return null;
 return{requestKey:ref.result,status:attempt?.status??'pending',diagnosticId:attempt?.diagnosticId??null,createdAt:ref.createdAt.toISOString()};
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
  await access.write(ctx,async tx=>{await tx.$queryRaw`SELECT id FROM "InteractionCase" WHERE id=${id}::uuid FOR UPDATE`;await access.resolveCase(ctx,id,'write',tx);const pending=await pendingInboxSend(tx,ctx,id,source);if(pending&&pending.requestKey!==v.requestKey)throw new HttpError(409,'A previous reply needs official verification');if(!await tx.interactionAudit.findFirst({where:{workspaceId:ctx.workspaceId,targetId:id,action:'reply.reference',result:v.requestKey}}))await tx.interactionAudit.create({data:{workspaceId:ctx.workspaceId,actorId:ctx.userId,action:'reply.reference',targetId:id,result:v.requestKey}});});
  return registry.getInboxAdapter(asset.platform).reply(asset,source,v.text,v.requestKey);
 },async acknowledgeSend(ctx:Scope,id:string,input:unknown){
  const v=z.object({requestKey:z.string().uuid(),confirmed:z.literal(true)}).strict().parse(input);const {source}=await access.resolveCase(ctx,id,'write');
  return access.write(ctx,async tx=>{await tx.$queryRaw`SELECT id FROM "InteractionCase" WHERE id=${id}::uuid FOR UPDATE`;await access.resolveCase(ctx,id,'write',tx);const p=await pendingInboxSend(tx,ctx,id,source);if(!p||p.requestKey!==v.requestKey)throw new HttpError(409,'Pending send changed');if(p.status==='pending'&&Date.now()-Date.parse(p.createdAt)<30000)throw new HttpError(409,'Send still pending');await tx.interactionAudit.create({data:{workspaceId:ctx.workspaceId,actorId:ctx.userId,action:'reply.acknowledge',targetId:id,result:v.requestKey}});return{acknowledged:true};});
 }};
}
