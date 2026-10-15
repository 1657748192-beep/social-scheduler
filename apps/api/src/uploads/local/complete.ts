import {randomUUID} from 'node:crypto';
import {config} from '../../config';
import {HttpError} from '../../utils/errors';
import {assemblyKey} from './disk';
import {getOwnedSession,requireUploadWriteAccess} from './sessions';
import {MERGE_TTL_MS,RECEIPT_TTL_MS,expectedPartBytes,type ReadyMedia,type UploadActor} from './protocol';
import {type ChunkDeps} from './parts';

export async function removeUnreferenced(deps:ChunkDeps,keys:string[]){
 if(!keys.length)return;
 const count=await deps.db.mediaAsset.count({where:{OR:[{storageKey:{in:keys}},{thumbnailStorageKey:{in:keys}}]}});
 if(count)throw new Error('Refusing to delete referenced upload output');
 await deps.disk.removeOwned(keys);
}
async function ready(deps:ChunkDeps,assetId:string|null):Promise<ReadyMedia>{
 const asset=assetId?await deps.db.mediaAsset.findUnique({where:{id:assetId}}):null;
 if(!asset||asset.status!=='ready'||asset.originalDeletedAt||!await deps.disk.hasFile(asset.storageKey,asset.sizeBytes))throw new HttpError(410,'Completed media has expired',{code:'asset_expired'});
 return {...asset,originalAvailable:true};
}
export async function completeUpload(deps:ChunkDeps,actor:UploadActor,id:string):Promise<ReadyMedia>{
 await getOwnedSession(deps,actor,id);
 const claim=await deps.db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM local_upload_sessions WHERE id=${id}::uuid FOR UPDATE`;
  const session=await tx.localUploadSession.findFirstOrThrow({where:{id,...actor}});
  await requireUploadWriteAccess(tx,actor);
  if(session.state==='completed')return {session,parts:[],already:true};
  if(session.expiresAt<=deps.now()||['expired','cancelled'].includes(session.state))throw new HttpError(410,'Upload expired');
  if(session.state==='assembling'&&session.mergeLeaseUntil&&session.mergeLeaseUntil>deps.now())throw new HttpError(409,'Upload is being finalized',{code:'assembling'});
  const parts=await tx.localUploadPart.findMany({where:{sessionId:id},orderBy:{index:'asc'}});
  if(parts.length!==session.partHashes.length||parts.some((p,i)=>p.index!==i||p.sha256!==session.partHashes[i]||p.sizeBytes!==expectedPartBytes(session.sizeBytes,i)))throw new HttpError(409,'Upload blocks are incomplete',{code:'missing_parts'});
  const now=deps.now(),attempt=randomUUID();
  const claimed=await tx.localUploadSession.update({where:{id},data:{state:'assembling',mergeAttemptId:attempt,mergeLeaseUntil:new Date(now.getTime()+MERGE_TTL_MS)}});
  return {session:claimed,parts,already:false};
 });
 if(claim.already)return ready(deps,claim.session.mediaAssetId);
 const session=claim.session,attempt=session.mergeAttemptId!;
 const outputKey=assemblyKey(id,attempt,session.mimeType),thumbnailAttempt=randomUUID();
 const thumbnailKey=session.thumbnailStorageKey?assemblyKey(id,thumbnailAttempt,'image/jpeg'):null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),MERGE_TTL_MS);timer.unref();
 let committed=false;
 try{
  const output=await deps.disk.assemble(id,attempt,claim.parts,controller.signal,session.mimeType);
  if(output.sizeBytes!==session.sizeBytes)throw new HttpError(400,'Assembled upload size mismatch');
  let thumbnail:{storageKey:string;sizeBytes:number}|null=null;
  if(session.thumbnailStorageKey&&session.thumbnailSizeBytes){
   // Thumbnail was signature-checked on acceptance; obtain its stored checksum
   // through a bounded read in the disk boundary, not a public URL fetch.
   thumbnail=await deps.disk.assembleThumbnail(id,thumbnailAttempt,session.thumbnailStorageKey,session.thumbnailSizeBytes,controller.signal);
  }
  const asset=await deps.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM local_upload_sessions WHERE id=${id}::uuid FOR UPDATE`;
   const current=await tx.localUploadSession.findFirstOrThrow({where:{id,...actor}});
   await requireUploadWriteAccess(tx,actor);
   if(current.state!=='assembling'||current.mergeAttemptId!==attempt||!current.mergeLeaseUntil||current.mergeLeaseUntil<=deps.now())throw new HttpError(409,'Assembly attempt is no longer current',{code:'assembling'});
   if(!await deps.disk.hasFile(output.storageKey,session.sizeBytes))throw new HttpError(410,'Assembly output unavailable');
   const media=await tx.mediaAsset.create({data:{workspaceId:actor.workspaceId,uploadedBy:actor.userId,fileUrl:`${config.API_PUBLIC_URL}/uploads/${output.storageKey}`,storageKey:output.storageKey,mimeType:session.mimeType,sizeBytes:session.sizeBytes,metadata:{originalName:session.originalName},thumbnailStorageKey:thumbnail?.storageKey,thumbnailSizeBytes:thumbnail?.sizeBytes,thumbnailUrl:thumbnail?`${config.API_PUBLIC_URL}/uploads/${thumbnail.storageKey}`:null}});
   await tx.localUploadSession.update({where:{id},data:{state:'completed',mediaAssetId:media.id,expiresAt:new Date(deps.now().getTime()+RECEIPT_TTL_MS),mergeLeaseUntil:null}});
   return media;
  });
  committed=true;
  // Reservation remains until task cleanup has proved all residue is gone.
  try{await deps.disk.removeOwned(claim.parts.map(p=>p.storageKey));await deps.db.localUploadPart.deleteMany({where:{sessionId:id}});}catch{/* low-frequency cleanup retries */}
  return {...asset,originalAvailable:true};
 }catch(e){
  if(!committed){
   // A lost DB acknowledgement may have committed: check references before any
   // deletion. If DB is unavailable, retain residue for later reconciliation.
   try{
    await removeUnreferenced(deps,[outputKey,...(thumbnailKey?[thumbnailKey]:[])]);
    await deps.db.localUploadSession.updateMany({where:{id,state:'assembling',mergeAttemptId:attempt},data:{state:'receiving',mergeLeaseUntil:null}});
   }catch{/* fail safe: do not delete anything further */}
  }
  throw e;
 }finally{clearTimeout(timer);}
}
