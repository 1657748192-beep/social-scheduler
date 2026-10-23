import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import type {InboxDb} from '../interactionInbox/access';

type Binding={workspaceId:string;accountId:string;appId:string;providerAccountId:string;connectionId:string;connectionVersion:number;kind:'comment'|'message';targetId:string;after:Date;before?:Date;payloadHash?:string};
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
 return rows[0]??null;
}
