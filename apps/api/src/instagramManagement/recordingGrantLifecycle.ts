import {Prisma} from '@prisma/client';import type {MetaDeletionAsset} from '../interactionInbox/deletion';
const scrub={state:'closed',closedReason:'source_unavailable',providerAccountId:null,accountId:null,userId:null,connectionId:null,connectionVersion:null,sourceRecordId:null,providerEventId:null,actorId:null,conversationId:null,predecessorAttemptId:null,predecessorProviderId:null,marker:null,payloadHash:null,attemptId:null};
function valid(limit:number,now:Date){if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isFinite(+now))throw Error('Invalid recording grant cleanup');}
export async function closeInstagramRecordingGrants(tx:Prisma.TransactionClient,scope:MetaDeletionAsset,limit:number,now:Date,selection?:{actorId?:string;providerEventId?:string}){
 valid(limit,now);if(scope.platform!=='instagram')return 0;
 const where={workspaceId:scope.workspaceId,appId:scope.appId,providerAccountId:scope.providerAssetId,connectionId:scope.connectionId,connectionVersion:{lte:scope.connectionVersion},...(selection?.actorId?{actorId:selection.actorId}:{}),...(selection?.providerEventId?{providerEventId:selection.providerEventId}:{})};
 const rows=await tx.instagramReplyRecordingGrant.findMany({where,take:limit,orderBy:{id:'asc'},select:{id:true}});
 return(await tx.instagramReplyRecordingGrant.updateMany({where:{...where,id:{in:rows.map(v=>v.id)}},data:scrub})).count;
}
export async function expireInstagramRecordingGrants(tx:Prisma.TransactionClient,limit:number,now:Date,scope?:MetaDeletionAsset){
 valid(limit,now);
 const scoped=scope?Prisma.sql`AND g."workspaceId"=${scope.workspaceId}::uuid AND g."appId"=${scope.appId} AND g."providerAccountId"=${scope.providerAssetId} AND g."connectionId"=${scope.connectionId}::uuid AND g."connectionVersion"<=${scope.connectionVersion}`:Prisma.empty;
 const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT g.id FROM "InstagramReplyRecordingGrant" g
 WHERE g.state<>'closed' ${scoped} AND (g."expiresAt"<=${now} OR
 NOT EXISTS(SELECT 1 FROM "InstagramManagementConnection" c JOIN social_accounts a ON a.id=g."accountId"
 WHERE c.id=g."connectionId" AND c."workspaceId"=g."workspaceId" AND c."appId"=g."appId" AND c."providerAccountId"=g."providerAccountId" AND c.version=g."connectionVersion" AND c.status='active' AND c."tokenEncrypted" IS NOT NULL AND (c."expiresAt" IS NULL OR c."expiresAt">${now}) AND a.status='active' AND a.workspace_id=g."workspaceId" AND a.provider_account_id=g."providerAccountId") OR
 NOT EXISTS(SELECT 1 FROM "InstagramInteractionMessage" m WHERE m.id=g."sourceRecordId" AND m."workspaceId"=g."workspaceId" AND m."connectionId"=g."connectionId" AND m."connectionVersion"=g."connectionVersion" AND m."providerId"=g."providerEventId" AND m."actorId"=g."actorId" AND m.inbound AND NOT m.deleted))
 ORDER BY g.id LIMIT ${limit} FOR UPDATE OF g SKIP LOCKED`);
 return(await tx.instagramReplyRecordingGrant.updateMany({where:{id:{in:rows.map(v=>v.id)},state:{not:'closed'}},data:scrub})).count;
}
export async function purgeClosedInstagramRecordingGrants(tx:Prisma.TransactionClient,limit:number,now:Date){
 valid(limit,now);const where={state:'closed',actorId:null,sourceRecordId:null,connectionId:null,providerEventId:null,providerAccountId:null,accountId:null,userId:null,conversationId:null,predecessorAttemptId:null,predecessorProviderId:null,payloadHash:null,attemptId:null,forgetAfter:{lt:now}};
 const rows=await tx.instagramReplyRecordingGrant.findMany({where,take:limit,orderBy:{id:'asc'},select:{id:true}});return(await tx.instagramReplyRecordingGrant.deleteMany({where:{...where,id:{in:rows.map(v=>v.id)}}})).count;
}
