import type {PrismaClient} from '@prisma/client';import {z} from 'zod';
import {HttpError} from '../utils/errors';import {isPlatformAdmin} from '../utils/platformAdmin';
import type {InboxAccess,InboxDb} from './access';import type {Scope,CaseDto} from './types';
export async function presentInboxCase(db:InboxDb,ctx:Scope,id:string,accountId:string):Promise<CaseDto>{
 const c=await db.interactionCase.findFirstOrThrow({where:{id,workspaceId:ctx.workspaceId},include:{asset:true,customer:{include:{identities:true}},tags:{where:{tag:{deletedAt:null}},include:{tag:true}},receipts:{where:{userId:ctx.userId}}}}),r=c.receipts[0];
 const account=await db.socialAccount.findFirst({where:{id:accountId,workspaceId:ctx.workspaceId},select:{displayName:true}});
 return{id:c.id,kind:c.kind as CaseDto['kind'],accountId,customerId:c.customerId,customerName:c.customer?.identities.find(i=>i.assetId===c.assetId)?.displayName??null,sourceLabel:c.asset.platform+' · '+(account?.displayName??accountId),status:c.status,version:c.version,lastInboundAt:c.lastInboundAt?.toISOString()??null,unread:!!c.lastInboundAt&&(!r||r.lastReadAt<c.lastInboundAt||r.lastReadKey!==c.lastInboundKey),tags:c.tags.map(({tag})=>({id:tag.id,kind:tag.kind,name:tag.name,color:tag.color,version:tag.version})),assigneeId:c.assigneeId,sentiment:c.sentiment};
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
