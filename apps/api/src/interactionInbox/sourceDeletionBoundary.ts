import {createHmac} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {deriveMetaDeletionKey} from '../utils/tokenCrypto';
import type {ResolvedAsset} from './types';

/** Asset-level deletion admission before list counts/pagination. Detail guards still revalidate every source. */
export async function sourceDeletionBoundarySql(db:Pick<PrismaClient,'metaInboxDeletionMarker'>,a:ResolvedAsset):Promise<Prisma.Sql>{
 if(a.platform!=='facebook'&&a.platform!=='instagram'||!a.sourceRef)throw Error('Unsupported deletion boundary');
 const scope={workspaceId:a.ctx.workspaceId,platform:a.platform,appId:a.appNamespace,subjectKind:'asset'};
 const key=deriveMetaDeletionKey(),digest=(parts:unknown[])=>createHmac('sha256',key).update(JSON.stringify([scope.workspaceId,scope.platform,scope.appId,a.providerAssetId,'asset',...parts])).digest('hex');
 const epoch=[digest(['connection',a.sourceRef.connectionId,'version',a.connectionVersion]),digest(['version',a.connectionVersion])],cutoffKey=digest(['cutoff']);
 const markers=await db.metaInboxDeletionMarker.findMany({where:{...scope,subjectHash:{in:[...epoch,cutoffKey]}},select:{subjectHash:true,createdAt:true}});
 if(markers.some(m=>epoch.includes(m.subjectHash)))return Prisma.sql`FALSE`;
 const cutoff=markers.find(m=>m.subjectHash===cutoffKey)?.createdAt;
 if(!cutoff)return Prisma.sql`TRUE`;
 // Occurrence, not fetch/cache time, controls admission. Equality remains deleted.
 if(a.platform==='facebook')return Prisma.sql`(
  (c."sourceRef"->>'sourceRecordId' IS NULL AND COALESCE(c."lastInboundAt",c."createdAt")>${cutoff}) OR
  (c.kind='messages' AND EXISTS(SELECT 1 FROM facebook_interaction_messages m WHERE m.id::text=c."sourceRef"->>'sourceRecordId' AND m."managedPageId"::text=c."sourceRef"->>'managedPageId' AND m."connectionVersion"::text=c."sourceRef"->>'connectionVersion' AND m."occurredAt">${cutoff})) OR
  (c.kind='comments' AND EXISTS(SELECT 1 FROM facebook_interaction_comments m WHERE m.id::text=c."sourceRef"->>'sourceRecordId' AND m."managedPageId"::text=c."sourceRef"->>'managedPageId' AND m."connectionVersion"::text=c."sourceRef"->>'connectionVersion' AND m."occurredAt">${cutoff}))
 )`;
 return Prisma.sql`(
  (c.kind='messages' AND EXISTS(SELECT 1 FROM "InstagramInteractionMessage" m WHERE m.id::text=c."sourceRef"->>'sourceRecordId' AND m."workspaceId"=c."workspaceId" AND m."connectionId"::text=c."sourceRef"->>'connectionId' AND m."connectionVersion"::text=c."sourceRef"->>'connectionVersion' AND m."occurredAt">${cutoff})) OR
  (c.kind='comments' AND EXISTS(SELECT 1 FROM "InstagramInteractionComment" m WHERE m.id::text=c."sourceRef"->>'sourceRecordId' AND m."workspaceId"=c."workspaceId" AND m."connectionId"::text=c."sourceRef"->>'connectionId' AND m."connectionVersion"::text=c."sourceRef"->>'connectionVersion' AND m."occurredAt">${cutoff}))
 )`;
}
