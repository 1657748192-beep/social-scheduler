import type {Prisma} from '@prisma/client';
import {HttpError} from '../utils/errors';

/** Publishing unlink is allowed only after independent cleanup has drained. */
export async function releaseDrainedInstagramConnections(tx:Prisma.TransactionClient,account:{id:string;workspaceId:string;platform:string;providerAccountId:string}){
 if(account.platform!=='instagram')return;
 await tx.$queryRaw`SELECT id FROM social_accounts WHERE id=${account.id}::uuid FOR UPDATE`;
 const connections=await tx.instagramManagementConnection.findMany({where:{workspaceId:account.workspaceId,providerAccountId:account.providerAccountId},orderBy:{id:'asc'},take:51});
 if(connections.length>50)throw new HttpError(409,'Independent Instagram cleanup requires verification');
 for(const c of connections){
  await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${c.id}::uuid FOR UPDATE`;
  const current=await tx.instagramManagementConnection.findUniqueOrThrow({where:{id:c.id}});
  const pending=await tx.metaInboxDeletionRequest.count({where:{workspaceId:c.workspaceId,platform:'instagram',appId:c.appId,status:{not:'completed'}}});
  const data=await Promise.all([
   tx.instagramInteractionEvent.count({where:{connectionId:c.id}}),tx.instagramInteractionMessage.count({where:{connectionId:c.id}}),tx.instagramInteractionComment.count({where:{connectionId:c.id}}),
   tx.interactionIdentity.count({where:{asset:{instagramConnectionId:c.id}}}),tx.interactionCase.count({where:{asset:{instagramConnectionId:c.id}}})
  ]);
  if(current.status==='active'||current.tokenEncrypted||pending||data.some(Boolean))throw new HttpError(409,'请先断开 Instagram 独立互动授权，等待互动数据清理完成后再解除账号绑定。');
 }
 // All checks precede any removal; caller shares the same transaction and locks.
 await tx.instagramManagementConnection.deleteMany({where:{id:{in:connections.map(c=>c.id)}}});
}
