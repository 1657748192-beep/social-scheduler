import type {Prisma} from '@prisma/client';
import type {MetaDeletionTarget} from './deletion';
import {HttpError} from '../utils/errors';

/** Only whole-asset admission is integrated for Facebook; never guess actor scope. */
export async function purgeFacebookDeletionSources(tx:Prisma.TransactionClient,t:MetaDeletionTarget,limit:number){
 const a=t.asset;if(a.platform!=='facebook'||t.kind!=='asset')throw new HttpError(409,'Facebook deletion target unavailable');
 const page=await tx.facebookManagedPage.findFirst({where:{pageId:a.providerAssetId,connectionId:a.connectionId,connection:{workspaceId:a.workspaceId,appId:a.appId,version:{gte:a.connectionVersion}}},select:{id:true}});
 if(!page)throw new HttpError(409,'Facebook deletion source scope unavailable');
 const scope={managedPageId:page.id,connectionVersion:{lte:a.connectionVersion}};let purged=0;
 if(t.phase==='pending'){
  const rows=await tx.facebookInteractionEvent.findMany({where:scope,orderBy:{id:'asc'},take:limit,select:{id:true}});
  purged=(await tx.facebookInteractionEvent.deleteMany({where:{...scope,id:{in:rows.map(r=>r.id)}}})).count;
  if(rows.length<limit)t.phase='messages';
 }else if(t.phase==='messages'){
  const attempts=await tx.facebookInteractionSendAttempt.findMany({where:{...scope,payloadHash:{not:'deleted'}},take:limit,select:{id:true}});
  if(attempts.length){purged=(await tx.facebookInteractionSendAttempt.updateMany({where:{...scope,id:{in:attempts.map(r=>r.id)}},data:{payloadHash:'deleted',providerId:null,errorCode:null,diagnosticId:null,status:'unknown'}})).count;}
  else{
   const rows=await tx.facebookInteractionMessage.findMany({where:scope,orderBy:{id:'asc'},take:limit,select:{id:true}});
   purged=(await tx.facebookInteractionMessage.deleteMany({where:{...scope,id:{in:rows.map(r=>r.id)}}})).count;if(rows.length<limit)t.phase='comments';
  }
 }else if(t.phase==='comments'){
  const rows=await tx.facebookInteractionComment.findMany({where:scope,orderBy:{id:'asc'},take:limit,select:{id:true}});
  if(rows.length)purged=(await tx.facebookInteractionComment.deleteMany({where:{...scope,id:{in:rows.map(r=>r.id)}}})).count;
  else{
   const threads=await tx.facebookInteractionThread.findMany({where:scope,take:limit,select:{id:true}});
   purged=(await tx.facebookInteractionThread.deleteMany({where:{...scope,id:{in:threads.map(r=>r.id)}}})).count;
   if(threads.length<limit){
    // Nullable legacy rows are not authority to erase a later grant's state.
    const unknown={managedPageId:page.id,connectionVersion:null};
    if(await tx.facebookInteractionEvent.findFirst({where:unknown,select:{id:true}})||await tx.facebookInteractionMessage.findFirst({where:unknown,select:{id:true}})||await tx.facebookInteractionComment.findFirst({where:unknown,select:{id:true}})||await tx.facebookInteractionThread.findFirst({where:unknown,select:{id:true}})||await tx.facebookInteractionSendAttempt.findFirst({where:unknown,select:{id:true}}))t.unmappedRaw=true;
    t.phase='sources_done';
   }
  }
 }
 return{purged,sourcesComplete:t.phase==='sources_done'};
}
