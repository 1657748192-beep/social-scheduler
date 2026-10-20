import type {Prisma} from '@prisma/client';
import {terminalFields} from './types';
const active=['awaiting_authorization','authorized_pending_selection','importing'];
async function invalidate(tx:Prisma.TransactionClient,where:Prisma.FacebookPageImportInvitationWhereInput,at:Date){
 // Caller holds either the subject fence or membership lock. Stable row order.
 const rows=await tx.facebookPageImportInvitation.findMany({where:{...where,status:{in:active}},orderBy:{id:'asc'},select:{id:true}});
 let invalidated=0;
 for(const {id} of rows){await tx.$queryRaw`SELECT id FROM "FacebookPageImportInvitation" WHERE id=${id}::uuid FOR UPDATE`;
  const row=await tx.facebookPageImportInvitation.findFirst({where:{...where,id,status:{in:active}}});if(!row)continue;
  await tx.facebookPageImportCandidate.deleteMany({where:{invitationId:id}});await tx.facebookPageImportInvitation.update({where:{id},data:terminalFields('revoked',at)});invalidated++;
 }return{invalidated};
}
export function invalidatePageImportInvitations(tx:Prisma.TransactionClient,n:{platform:'facebook';appId:string},subjectHash:string,cutoff:Date){return invalidate(tx,{appId:n.appId,authorizerSubjectHash:subjectHash,authorizationStartedAt:{lte:cutoff}},new Date());}
export function retirePageImportCreator(tx:Prisma.TransactionClient,workspaceId:string,createdById:string){return invalidate(tx,{workspaceId,createdById},new Date());}
