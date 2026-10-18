import type {Prisma} from '@prisma/client';
import {HttpError} from '../utils/errors';
import type {InstagramInboxSource} from './source';

/** Called under the independent connection lock, before projection upserts. */
export async function reconcileInstagramCases(tx:Prisma.TransactionClient,workspaceId:string,assetId:string,threadId:string,ref:InstagramInboxSource){
 if(!ref.conversationId||!ref.participantId)return;
 const rows=await tx.interactionCase.findMany({where:{workspaceId,assetId,kind:'messages',AND:[{sourceRef:{path:['connectionId'],equals:ref.connectionId}},{sourceRef:{path:['connectionVersion'],equals:ref.connectionVersion}},{sourceRef:{path:['participantId'],equals:ref.participantId}}]},orderBy:[{createdAt:'asc'},{id:'asc'}],take:51});
 if(rows.length>50)throw new HttpError(409,'Conversation reconciliation requires scoped verification');
 if(!rows.length)return;
 const keep=rows.find(v=>v.providerThreadOrEventId===threadId)??rows[0];
 if(rows.some(v=>v.customerId!==keep.customerId))throw new HttpError(409,'Conversation customer identity changed');
 for(const row of rows)await tx.$queryRaw`SELECT id FROM "InteractionCase" WHERE id=${row.id}::uuid FOR UPDATE`;
 for(const row of rows){if(row.id===keep.id)continue;
  await tx.interactionItem.updateMany({where:{workspaceId,assetId,caseId:row.id},data:{caseId:keep.id}});
  const tags=await tx.interactionCaseTag.findMany({where:{workspaceId,caseId:row.id}});
  await tx.interactionCaseTag.createMany({skipDuplicates:true,data:tags.map(v=>({workspaceId,caseId:keep.id,tagId:v.tagId,kind:v.kind,createdAt:v.createdAt}))});
  // Receipts may reset to unread, but never discard send keys or acknowledgements.
  await tx.interactionAudit.updateMany({where:{workspaceId,targetId:row.id},data:{targetId:keep.id}});
  await tx.interactionCase.delete({where:{id:row.id}});
 }
 const last=await tx.interactionItem.findFirst({where:{workspaceId,assetId,caseId:keep.id,direction:'inbound',deleted:false},orderBy:[{occurredAt:'desc'},{id:'desc'}]});
 await tx.interactionCase.update({where:{id:keep.id},data:{providerThreadOrEventId:threadId,...(last?{lastInboundAt:last.occurredAt,lastInboundKey:last.providerEventId}:{}),version:{increment:1}}});
}
