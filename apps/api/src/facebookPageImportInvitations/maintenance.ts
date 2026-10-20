import type {PrismaClient} from '@prisma/client';
import {invitationDeadline,terminalFields} from './types';
import {creatorActive} from './access';
export async function runInvitationMaintenance(db:PrismaClient,now:Date,limit=50){
 const cap=Math.max(1,Math.min(50,Math.trunc(limit)));if(!Number.isFinite(cap)||!Number.isFinite(now.getTime()))throw Error('Invalid maintenance bounds');
 return db.$transaction(async tx=>{
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT i.id FROM "FacebookPageImportInvitation" i WHERE
   (i."retentionExpiresAt"<=${now}) OR
   (i.status IN ('awaiting_authorization','authorized_pending_selection','importing') AND
    (COALESCE(i."candidateExpiresAt",i."expiresAt")<=${now} OR NOT EXISTS
     (SELECT 1 FROM workspace_members m WHERE m.workspace_id=i."workspaceId" AND m.user_id=i."createdById" AND m.status='active' AND m.role IN ('owner','admin'))))
   ORDER BY i.id LIMIT ${cap} FOR UPDATE OF i SKIP LOCKED`;
  let cleared=0,removed=0;
  for(const {id} of rows){const row=await tx.facebookPageImportInvitation.findUniqueOrThrow({where:{id}});
   if(row.retentionExpiresAt&&row.retentionExpiresAt<=now){await tx.facebookPageImportInvitation.delete({where:{id}});removed++;continue;}
   const deadline=invitationDeadline(row),expired=deadline<=now;
   if(!expired&&await creatorActive(tx,row))continue;
   await tx.facebookPageImportCandidate.deleteMany({where:{invitationId:id}});await tx.facebookPageImportInvitation.update({where:{id},data:terminalFields(expired?'expired':'revoked',expired?deadline:now)});cleared++;
  }return{cleared,removed};
 });
}
export function createInvitationMaintenance(db:PrismaClient){let next=0,running=false;return async()=>{if(running||Date.now()<next)return;running=true;next=Date.now()+60000;try{await runInvitationMaintenance(db,new Date());}finally{running=false;}};}
