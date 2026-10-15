import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import type {LocalUploadSession,Prisma} from '@prisma/client';
import {HttpError} from '../../utils/errors';
import {getOwnedSession,getUploadView,requireUploadWriteAccess} from './sessions';
import {expectedPartBytes,MIN_FREE_BYTES,UPLOAD_TTL_MS,type SessionDeps,type UploadActor,type UploadView} from './protocol';
import type {LocalUploadDisk,StoredPart} from './disk';
import type {UploadLeaseManager} from './leases';

export type ChunkDeps=SessionDeps & {disk:LocalUploadDisk;leases:UploadLeaseManager};
export function requireReceiving(session:LocalUploadSession,now:Date){
 if(session.expiresAt<=now||['expired','cancelled'].includes(session.state)||session.reservedBytes<=0)throw new HttpError(410,'Upload session is no longer available',{code:'upload_expired'});
 if(session.state!=='receiving')throw new HttpError(409,'Upload is being finalized',{code:session.state==='assembling'?'assembling':'completed'});
}
export async function lockReceiving(tx:Prisma.TransactionClient,actor:UploadActor,id:string,now:Date){
 await tx.$queryRaw`SELECT id FROM local_upload_sessions WHERE id=${id}::uuid FOR UPDATE`;
 const session=await tx.localUploadSession.findFirst({where:{id,...actor}});
 if(!session)throw new HttpError(404,'Upload session not found');
 await requireUploadWriteAccess(tx,actor);requireReceiving(session,now);return session;
}
async function receiveWithLease<T>(deps:ChunkDeps,actor:UploadActor,id:string,index:number,action:(session:LocalUploadSession,expiresAtMs:number)=>Promise<T>){
 const session=await getOwnedSession(deps,actor,id);requireReceiving(session,deps.now());
 if(await deps.availableBytes()<MIN_FREE_BYTES+1048576n)throw new HttpError(507,'Upload storage is full');
 const outcome=await deps.leases.acquire(id,index);
 if(!outcome.ok)throw new HttpError(outcome.reason==='unavailable'?503:outcome.reason==='part_busy'?409:429,'Upload receiver is busy',{code:outcome.reason});
 try{
  await deps.db.$transaction(async tx=>{
   await lockReceiving(tx,actor,id,deps.now());const now=deps.now();
   await tx.localUploadSession.update({where:{id},data:{activityAt:now,expiresAt:new Date(now.getTime()+UPLOAD_TTL_MS)}});
  });
  return await action(session,outcome.lease.expiresAtMs);
 }finally{await deps.leases.release(outcome.lease).catch(()=>{});}
}
export async function acceptPart(deps:ChunkDeps,actor:UploadActor,id:string,index:number,body:Readable,signal:AbortSignal):Promise<UploadView>{
 const initial=await getOwnedSession(deps,actor,id);requireReceiving(initial,deps.now());
 const length=expectedPartBytes(initial.sizeBytes,index);
 return receiveWithLease(deps,actor,id,index,async (session,expiresAtMs)=>{
  let stored:StoredPart|undefined,confirmed=false;
  try{
   const existingPart=await deps.db.localUploadPart.findUnique({where:{sessionId_index:{sessionId:id,index}}});
   try{stored=await deps.disk.receive(id,index,body,length,session.partHashes[index],signal);}
   catch(e){if(existingPart&&e instanceof HttpError&&e.statusCode===400)throw new HttpError(409,'Conflicting upload block',{code:'part_conflict'});throw e;}
   return await deps.db.$transaction(async tx=>{
    const current=await lockReceiving(tx,actor,id,deps.now());
    if(deps.now().getTime()>=expiresAtMs)throw new HttpError(503,'Upload receiver lease expired');
    const existing=await tx.localUploadPart.findUnique({where:{sessionId_index:{sessionId:id,index}}});
    if(existing&&(existing.sha256!==stored!.sha256||existing.sizeBytes!==stored!.sizeBytes))throw new HttpError(409,'Conflicting upload block',{code:'part_conflict'});
    if(!existing){await tx.localUploadPart.create({data:{sessionId:id,index,...stored!}});confirmed=true;}
    const now=deps.now();
    const updated=await tx.localUploadSession.update({where:{id},data:{activityAt:now,expiresAt:new Date(now.getTime()+UPLOAD_TTL_MS)}});
    const parts=await tx.localUploadPart.findMany({where:{sessionId:id},select:{index:true}});
    return getUploadView(updated,parts.map(p=>p.index));
   });
  }catch(e){confirmed=false;throw e;}finally{if(stored&&!confirmed)await deps.disk.removeOwned([stored.storageKey]);}
 });
}
export async function acceptThumbnail(deps:ChunkDeps,actor:UploadActor,id:string,body:Readable,signal:AbortSignal){
 return receiveWithLease(deps,actor,id,250,async(_session,expiresAtMs)=>{
  const buffers:Buffer[]=[];let size=0;
  for await(const chunk of body){signal.throwIfAborted();const b=Buffer.from(chunk);size+=b.length;if(size>102400)throw new HttpError(413,'Thumbnail exceeds 100KiB');buffers.push(b);}
  const bytes=Buffer.concat(buffers);
  if(bytes.length<5||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new HttpError(400,'Thumbnail must be JPEG');
  const stored=await deps.disk.receive(id,0,Readable.from([bytes]),bytes.length,createHash('sha256').update(bytes).digest('hex'),signal);
  let keep=false;
  try{return await deps.db.$transaction(async tx=>{
   const session=await lockReceiving(tx,actor,id,deps.now());
   if(deps.now().getTime()>=expiresAtMs)throw new HttpError(503,'Upload receiver lease expired');
   if(!session.thumbnailStorageKey){await tx.localUploadSession.update({where:{id},data:{thumbnailStorageKey:stored.storageKey,thumbnailSizeBytes:size}});keep=true;}
   return {received:true};
  });}catch(e){keep=false;throw e;}finally{if(!keep)await deps.disk.removeOwned([stored.storageKey]);}
 });
}
