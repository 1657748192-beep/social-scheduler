import {createHmac} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import type {MetaDeletionNamespace} from './metaDeletionRoutes';
import {deriveMetaDeletionKey} from '../utils/tokenCrypto';
import {HttpError} from '../utils/errors';
export function createMetaGrantFence(hmacKey=deriveMetaDeletionKey()){
 if(hmacKey.length<16)throw new Error('Meta grant fence configuration unavailable');
 function subjectHash(n:MetaDeletionNamespace,userId:string){
  if(!['instagram','facebook'].includes(n.platform)||!/^\d{1,256}$/.test(n.appId)||!/^\d{1,256}$/.test(userId))throw new HttpError(400,'Invalid Meta grant scope');
  // Preserve the existing app-level subject digest format.
  return createHmac('sha256',hmacKey).update(JSON.stringify(['app-user',n.platform,n.appId,userId])).digest('hex');
 }
 async function lockAndRead(tx:Prisma.TransactionClient,n:MetaDeletionNamespace,userId:string){
  const hash=subjectHash(n,userId);await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${hash},0))`;
  return tx.metaInboxGrantFence.findUnique({where:{platform_appId_subjectHash:{...n,subjectHash:hash}}});
 }
 return{subjectHash,lockAndRead,async advance(tx:Prisma.TransactionClient,n:MetaDeletionNamespace,userId:string,cutoff:Date){
  if(!Number.isFinite(cutoff.getTime()))throw new HttpError(400,'Invalid Meta grant cutoff');
  const previous=await lockAndRead(tx,n,userId),key={...n,subjectHash:subjectHash(n,userId)};
  return tx.metaInboxGrantFence.upsert({where:{platform_appId_subjectHash:key},create:{...key,cutoff},update:!previous||previous.cutoff<cutoff?{cutoff}:{}});
 }};
}
