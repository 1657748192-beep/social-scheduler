import {randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {getOwnedSession} from './sessions';
import type {ChunkDeps} from './parts';
import {UPLOAD_TTL_MS,type UploadActor,type UploadState} from './protocol';
import {abortLocalUploads} from './operations';
function deletionOrder(keys:string[]){const weight=(key:string)=>key.endsWith('.receipt')?2:key.startsWith('local-upload-')?0:1;return [...keys].sort((a,b)=>weight(a)-weight(b));}

async function cleanOne(deps:ChunkDeps,id:string){
 const token=randomUUID(),now=deps.now();
 const claim=await deps.db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM local_upload_sessions WHERE id=${id}::uuid FOR UPDATE`;
  const s=await tx.localUploadSession.findUnique({where:{id}});if(!s)return null;
  if(s.cleanupLeaseUntil&&s.cleanupLeaseUntil>now)return null;
  if(['receiving','assembling'].includes(s.state)&&s.expiresAt>now)return null;
  if(s.state==='assembling'&&s.mergeLeaseUntil&&s.mergeLeaseUntil>now)return null;
  return tx.localUploadSession.update({where:{id},data:{state:['receiving','assembling'].includes(s.state)?'expired':s.state,cleanupToken:token,cleanupLeaseUntil:new Date(now.getTime()+300000)}});
 });
 if(!claim)return false;
 try{
  if(await deps.leases.active(id))return false;
  // Cross-process assembly leases are also honored after cancellation.
  if(claim.mergeLeaseUntil&&claim.mergeLeaseUntil>deps.now())return false;
  const files=await deps.disk.ownedFiles(id),keys=files.map(f=>f.storageKey);
  const references=await deps.db.mediaAsset.findMany({where:{OR:[{storageKey:{in:keys}},{thumbnailStorageKey:{in:keys}}]},select:{id:true,storageKey:true,thumbnailStorageKey:true}});
  if(references.some(asset=>asset.id!==claim.mediaAssetId))throw new Error('Upload residue references another asset');
  const keep=new Set(references.flatMap(a=>[a.storageKey,a.thumbnailStorageKey].filter((v):v is string=>!!v)));
  await deps.disk.removeOwned(deletionOrder(keys.filter(key=>!keep.has(key))));
  await deps.disk.pruneSessionDirectory(id);
  await deps.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM local_upload_sessions WHERE id=${id}::uuid FOR UPDATE`;
   const current=await tx.localUploadSession.findUnique({where:{id}});
   if(!current||current.cleanupToken!==token)return;
   await tx.localUploadPart.deleteMany({where:{sessionId:id}});
   if(current.state==='completed'&&current.expiresAt<=deps.now()){await tx.localUploadSession.delete({where:{id}});return;}
   await tx.localUploadSession.update({where:{id},data:{reservedBytes:0,residueClearedAt:deps.now(),thumbnailStorageKey:null,thumbnailSizeBytes:null,cleanupToken:null,cleanupLeaseUntil:null}});
  });
  return true;
 }finally{
  await deps.db.localUploadSession.updateMany({where:{id,cleanupToken:token},data:{cleanupToken:null,cleanupLeaseUntil:null}});
 }
}

export async function cancelUpload(deps:ChunkDeps,actor:UploadActor,id:string):Promise<{state:UploadState;cleanupPending:boolean}>{
 id=(await getOwnedSession(deps,actor,id)).id;
 const state=await deps.db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM local_upload_sessions WHERE id=${id}::uuid FOR UPDATE`;
  const s=await tx.localUploadSession.findFirstOrThrow({where:{id,...actor}});
  if(s.state==='completed')return 'completed' as const;
  await tx.localUploadSession.update({where:{id},data:{state:'cancelled'}});return 'cancelled' as const;
 });
 if(state==='completed')return {state,cleanupPending:false};
 // Local streams obey abort immediately. Other API processes remain protected
 // by DB state and Redis/assembly leases until they finish or expire.
 await abortLocalUploads(id);
 try{return {state,cleanupPending:!await cleanOne(deps,id)};}
 catch{return {state,cleanupPending:true};}
}

export async function cleanLocalUploads(deps:ChunkDeps,limit=50):Promise<{scanned:number;cleaned:number;failed:number}>{
 limit=Math.max(1,Math.min(50,Math.floor(limit)||50));const now=deps.now();
 const where:Prisma.LocalUploadSessionWhereInput={OR:[
  {state:{in:['receiving','assembling']},expiresAt:{lte:now}},
  {state:{in:['cancelled','expired']},residueClearedAt:null},
  {state:'completed',OR:[{residueClearedAt:null},{expiresAt:{lte:now}}]}
 ]};
 const sessions=await deps.db.localUploadSession.findMany({where,orderBy:{createdAt:'asc'},take:limit,select:{id:true}});
 const result={scanned:0,cleaned:0,failed:0};
 for(const session of sessions){result.scanned++;try{if(await cleanOne(deps,session.id))result.cleaned++;}catch(e){result.failed++;console.warn('Local upload cleanup deferred',{id:session.id,code:(e as NodeJS.ErrnoException).code??'cleanup_failed'});}}
 if(result.scanned<limit){
  const before=new Date(now.getTime()-UPLOAD_TTL_MS);
  for(const sid of await deps.disk.orphanCandidates(before,limit-result.scanned)){
   if(await deps.db.localUploadSession.findUnique({where:{id:sid},select:{id:true}}))continue;
   result.scanned++;
   try{
    if(await deps.leases.active(sid))continue;
    const files=await deps.disk.ownedFiles(sid);if(files.some(f=>f.mtimeMs>=before.getTime()))continue;
    const keys=files.map(f=>f.storageKey);
    if(await deps.db.mediaAsset.count({where:{OR:[{storageKey:{in:keys}},{thumbnailStorageKey:{in:keys}}]}}))throw new Error('Orphan upload output is referenced');
    await deps.disk.removeOwned(deletionOrder(keys));await deps.disk.pruneSessionDirectory(sid);result.cleaned++;
   }catch(e){result.failed++;console.warn('Orphan upload cleanup deferred',{id:sid,code:(e as NodeJS.ErrnoException).code??'cleanup_failed'});}
  }
 }
 return result;
}
export function startLocalUploadCleanup(deps:ChunkDeps){
 let stopped=false,current:Promise<unknown>|null=null;
 const run=()=>{if(stopped||current)return;current=cleanLocalUploads(deps).catch(()=>console.warn('Local upload cleanup unavailable')).finally(()=>{current=null;});};
 run();const timer=setInterval(run,3600000);timer.unref();
 return {async stop(){stopped=true;clearInterval(timer);await abortLocalUploads();await current;}};
}
