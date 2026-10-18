import type {Prisma} from '@prisma/client';
import type {MetaDeletionTarget} from './deletion';
import {HttpError} from '../utils/errors';
import {createHash} from 'node:crypto';

/** Verified assets/comments only; never infer a visitor-wide deletion scope. */
export async function purgeFacebookDeletionSources(tx:Prisma.TransactionClient,t:MetaDeletionTarget,limit:number){
 const a=t.asset;if(a.platform!=='facebook'||t.kind!=='asset'&&(t.kind!=='item'||t.eventKind!=='comments'||!t.subjectId))throw new HttpError(409,'Facebook deletion target unavailable');
 const page=await tx.facebookManagedPage.findFirst({where:{pageId:a.providerAssetId,connectionId:a.connectionId,connection:{workspaceId:a.workspaceId,appId:a.appId,version:{gte:a.connectionVersion}}},select:{id:true}});
 if(!page)throw new HttpError(409,'Facebook deletion source scope unavailable');
 const scope={managedPageId:page.id,connectionVersion:{lte:a.connectionVersion}};let purged=0;
 if(t.phase==='pending'){
  const rows=await tx.facebookInteractionEvent.findMany({where:{...scope,...(t.kind==='item'&&t.rawAfter?{id:{gt:t.rawAfter}}:{})},orderBy:{id:'asc'},take:limit,select:{id:true,payload:true,status:true}}),ids:string[]=[];
  for(const row of rows){if(t.kind==='asset'){ids.push(row.id);continue;}const p=row.payload as any;if(p?.kind==='comment'&&p.providerId===t.subjectId)ids.push(row.id);else if(row.status==='done'&&p&&typeof p==='object'&&Object.keys(p).length===0){/* Already-cleared opaque audit; no retained content to map. */}else if(!p||!['comment','message'].includes(p.kind)||typeof p.providerId!=='string')t.unmappedRaw=true;}
  purged=(await tx.facebookInteractionEvent.deleteMany({where:{...scope,id:{in:ids}}})).count;
  if(rows.length<limit){t.phase=t.kind==='item'?'comments':'messages';delete t.rawAfter;}else if(t.kind==='item')t.rawAfter=rows.at(-1)!.id;
 }else if(t.phase==='messages'){
  const attempts=await tx.facebookInteractionSendAttempt.findMany({where:{...scope,payloadHash:{not:'deleted'}},take:limit,select:{id:true}});
  if(attempts.length){purged=(await tx.facebookInteractionSendAttempt.updateMany({where:{...scope,id:{in:attempts.map(r=>r.id)}},data:{targetHash:'deleted',payloadHash:'deleted',providerId:null,errorCode:null,diagnosticId:null,status:'unknown'}})).count;}
  else{
   const rows=await tx.facebookInteractionMessage.findMany({where:scope,orderBy:{id:'asc'},take:limit,select:{id:true}});
   purged=(await tx.facebookInteractionMessage.deleteMany({where:{...scope,id:{in:rows.map(r=>r.id)}}})).count;if(rows.length<limit)t.phase='comments';
  }
 }else if(t.phase==='comments'){
  if(t.kind==='item'){
   const targetHash=createHash('sha256').update(JSON.stringify(['comment',t.subjectId])).digest('hex'),attempts=await tx.facebookInteractionSendAttempt.findMany({where:{...scope,targetHash,payloadHash:{not:'deleted'}},take:limit,select:{id:true}});
   if(attempts.length)return{purged:(await tx.facebookInteractionSendAttempt.updateMany({where:{...scope,id:{in:attempts.map(r=>r.id)}},data:{targetHash:'deleted',payloadHash:'deleted',providerId:null,errorCode:null,diagnosticId:null,status:'unknown'}})).count,sourcesComplete:false};
   if(await tx.facebookInteractionSendAttempt.findFirst({where:{...scope,targetHash:null,payloadHash:{not:'deleted'}},select:{id:true}})||await tx.facebookInteractionComment.findFirst({where:{managedPageId:page.id,providerId:t.subjectId,connectionVersion:null},select:{id:true}}))t.unmappedRaw=true;
  }
  const comments={...scope,...(t.kind==='item'?{providerId:t.subjectId}:{})},rows=await tx.facebookInteractionComment.findMany({where:comments,orderBy:{id:'asc'},take:limit,select:{id:true}});
  if(rows.length)purged=(await tx.facebookInteractionComment.deleteMany({where:{...scope,id:{in:rows.map(r=>r.id)}}})).count;
  else if(t.kind==='item')t.phase='sources_done';
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
