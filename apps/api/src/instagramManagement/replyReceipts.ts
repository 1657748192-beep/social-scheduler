import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import type {InboxDb} from '../interactionInbox/access';
import {requireInboxAccess} from '../interactionInbox/access';
import type {ResolvedAsset,SourceRef} from '../interactionInbox/types';
import {parseInboxSource} from '../interactionInbox/source';
import {instagramRecordingIncomingKey,REC3_TEXT,REC3_MARKER} from './recordingGrantIdentity';

type Binding={workspaceId:string;accountId:string;appId:string;providerAccountId:string;connectionId:string;connectionVersion:number;kind:'comment'|'message';targetId:string;after:Date;before?:Date;payloadHash?:string;qualifiedRec3?:true};
export async function findInstagramRecordingGrantReceipt(db:InboxDb,b:{asset:ResolvedAsset;source:SourceRef;after:Date;before:Date}){
 const a=b.asset,s=parseInboxSource(b.source,'instagram');await requireInboxAccess(db,a.ctx);
 if(a.platform!=='instagram'||s.instagramAccountId!==a.accountId||s.connectionId!==a.sourceRef?.connectionId||s.connectionVersion!==a.connectionVersion)return null;
 const source=await db.instagramInteractionMessage.findFirst({where:{id:s.sourceRecordId,workspaceId:a.ctx.workspaceId,connectionId:s.connectionId,connectionVersion:s.connectionVersion,actorId:s.participantId,conversationId:s.conversationId,inbound:true,deleted:false}});if(!source||source.occurredAt>b.before)return null;
 if(await db.instagramInteractionMessage.findFirst({where:{workspaceId:a.ctx.workspaceId,connectionId:s.connectionId,connectionVersion:s.connectionVersion,actorId:s.participantId,inbound:true,deleted:false,id:{not:source.id},occurredAt:{gte:source.occurredAt,lte:b.before}},select:{id:true}}))return null;
 const g=await db.instagramReplyRecordingGrant.findUnique({where:{incomingKey:instagramRecordingIncomingKey({workspaceId:a.ctx.workspaceId,appId:a.appNamespace,providerAccountId:a.providerAssetId,providerEventId:source.providerId})}});
 if(!g||g.state!=='sent'||!g.attemptId||g.sourceRecordId!==source.id||g.connectionId!==s.connectionId||g.connectionVersion!==s.connectionVersion||g.accountId!==a.accountId||g.actorId!==s.participantId||g.conversationId!==s.conversationId||g.marker!==REC3_MARKER||g.payloadHash!==createHash('sha256').update(JSON.stringify(REC3_TEXT)).digest('hex'))return null;
 const attempt=await db.instagramInteractionSendAttempt.findUnique({where:{id:g.attemptId}});if(!attempt||attempt.status!=='sent'||!attempt.providerId||!/^[-a-zA-Z0-9_:.]{1,256}$/.test(attempt.providerId)||attempt.workspaceId!==g.workspaceId||attempt.connectionId!==g.connectionId||attempt.connectionVersion!==g.connectionVersion||attempt.payloadHash!==g.payloadHash)return null;
 if(!await db.interactionAudit.findFirst({where:{workspaceId:g.workspaceId,action:'instagram.reply.original',targetId:s.connectionId,result:s.connectionVersion+':'+attempt.requestKey}}))return null;
 const receipt=await findInstagramReplyReceipt(db,{workspaceId:a.ctx.workspaceId,accountId:a.accountId,appId:a.appNamespace,providerAccountId:a.providerAssetId,connectionId:s.connectionId,connectionVersion:s.connectionVersion,kind:'message',targetId:s.participantId!,after:b.after,before:b.before,payloadHash:g.payloadHash,qualifiedRec3:true});
 return receipt?.providerId===attempt.providerId?receipt:null;
}
/** Read-only receipt evidence. Copied receipts never establish a newer send. */
export async function findInstagramReplyReceipt(db:InboxDb,b:Binding){
 const before=b.before??new Date();
 if(!Number.isFinite(b.after.getTime())||b.after>before)return null;
 const targetHash=createHash('sha256').update(JSON.stringify([b.kind,b.targetId])).digest('hex');
 const rows=await db.$queryRaw<Array<{providerId:string;payloadHash:string;createdAt:Date;updatedAt:Date}>>(Prisma.sql`
  SELECT s."providerId",s."payloadHash",s."createdAt",s."updatedAt"
  FROM "InstagramInteractionSendAttempt" s
  JOIN "InstagramManagementConnection" g ON g.id=s."connectionId"
  JOIN social_accounts a ON a.workspace_id=g."workspaceId" AND a.platform='instagram' AND a.provider_account_id=g."providerAccountId"
  WHERE s."workspaceId"=${b.workspaceId}::uuid AND s."connectionId"=${b.connectionId}::uuid
   AND g."workspaceId"=${b.workspaceId}::uuid AND g."appId"=${b.appId} AND g."providerAccountId"=${b.providerAccountId}
   AND g.status='active' AND g.version=${b.connectionVersion} AND g."tokenEncrypted" IS NOT NULL
   AND (g."expiresAt" IS NULL OR g."expiresAt">${before}) AND a.id=${b.accountId}::uuid AND a.status='active'
   AND s."connectionVersion"=${b.connectionVersion} AND s."targetHash"=${targetHash}
   AND s.status='sent' AND s."providerId" IS NOT NULL AND s."providerId"<>''
   AND s."createdAt">=${b.after} AND s."createdAt"<=${before} AND s."updatedAt"<=${before}
   ${b.payloadHash?Prisma.sql`AND s."payloadHash"=${b.payloadHash}`:Prisma.empty}
   AND (EXISTS(SELECT 1 FROM "InteractionAudit" proof
     WHERE proof."workspaceId"=s."workspaceId" AND proof.action='instagram.reply.original'
      AND proof."targetId"=s."connectionId"::text AND proof.result=s."connectionVersion"::text||':'||s."requestKey"::text)
    OR NOT EXISTS(SELECT 1 FROM "InstagramInteractionSendAttempt" erased
     WHERE erased."workspaceId"=s."workspaceId" AND erased."connectionId"=s."connectionId"
      AND erased."targetHash"='deleted' AND (erased."createdAt",erased.id)<(s."createdAt",s.id)))
   AND NOT EXISTS(SELECT 1 FROM "InstagramInteractionSendAttempt" original
    WHERE original."connectionId"=s."connectionId" AND original."providerId"=s."providerId"
     AND (original."createdAt",original.id)<(s."createdAt",s.id))
  ORDER BY s."createdAt",s.id LIMIT 1`);
 const receipt=rows[0];
 // REC3's reserved recording payload never answers an arbitrary later inbound.
 // Only the qualification-bound reader above may use it as replied evidence.
 if(receipt?.payloadHash===createHash('sha256').update(JSON.stringify(REC3_TEXT)).digest('hex')&&!b.qualifiedRec3)return null;
 return receipt??null;
}
