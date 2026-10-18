import type {InboxDb} from './access';
import type {SourceRef} from './types';
import {Prisma} from '@prisma/client';
import {createLiveInboxPolicy,type LiveInboxPolicy} from './livePolicy';
import {isMetaInboxSourceDeleted} from './deletion';
export const inboxCutoff=(now=new Date())=>new Date(now.getTime()-90*86400000);
export function liveInboxCaseSql(now=new Date()){
 const cutoff=inboxCutoff(now);
 return Prisma.sql`c."createdAt">=${cutoff} AND COALESCE(c."sourceRef"->>'platform','facebook')='facebook' AND EXISTS(SELECT 1 FROM "InteractionAsset" a WHERE a.id=c."assetId" AND a.platform='facebook') AND (c."sourceRef"->>'sourceRecordId' IS NULL OR (c.kind='messages' AND EXISTS(SELECT 1 FROM facebook_interaction_messages m WHERE m.id::text=c."sourceRef"->>'sourceRecordId' AND m."managedPageId"::text=c."sourceRef"->>'managedPageId' AND m."receivedAt">=${cutoff})) OR (c.kind='comments' AND EXISTS(SELECT 1 FROM facebook_interaction_comments m WHERE m.id::text=c."sourceRef"->>'sourceRecordId' AND m."managedPageId"::text=c."sourceRef"->>'managedPageId' AND NOT m.deleted AND m."receivedAt">=${cutoff})))`;
}
export async function inboxSourceAlive(db:InboxDb,source:SourceRef,createdAt:Date,now=new Date(),policy:LiveInboxPolicy=createLiveInboxPolicy([])){
 if(source.platform==='instagram'){
  if(!source.sourceRecordId||!!source.conversationId===!!source.commentId)return false;
  const c=await db.instagramManagementConnection.findFirst({where:{id:source.connectionId,version:source.connectionVersion,status:'active',tokenEncrypted:{not:null},OR:[{expiresAt:null},{expiresAt:{gt:now}}]},include:{account:{select:{id:true,status:true}}}});
  if(!c||c.account.id!==source.instagramAccountId||c.account.status!=='active')return false;
  const a={workspaceId:c.workspaceId,platform:'instagram' as const,appId:c.appId,providerAssetId:c.providerAccountId,connectionId:c.id,connectionVersion:c.version},cutoff=new Date(now.getTime()-policy.retentionForAsset(a).contentRetentionDays*86400000);
  if(!Number.isFinite(createdAt.getTime())||createdAt<cutoff)return false;
  const where={id:source.sourceRecordId,workspaceId:c.workspaceId,connectionId:c.id,connectionVersion:c.version,deleted:false,receivedAt:{gte:cutoff},occurredAt:{gte:cutoff}};
  const row=source.conversationId?await db.instagramInteractionMessage.findFirst({where:{...where,conversationId:source.conversationId,...(source.participantId?{actorId:source.participantId}:{})}}):await db.instagramInteractionComment.findFirst({where:{...where,providerId:source.commentId,...(source.mediaId?{mediaId:source.mediaId}:{})}});
  return !!row&&!await isMetaInboxSourceDeleted(db,{...a,actorId:row.actorId??undefined,providerEventId:row.providerId,eventKind:source.conversationId?'messages':'comments',occurredAt:row.occurredAt});
 }
 const page=await db.facebookManagedPage.findFirst({where:{id:source.managedPageId,connectionId:source.connectionId,active:true,pageTokenEncrypted:{not:null},OR:[{expiresAt:null},{expiresAt:{gt:now}}],connection:{version:source.connectionVersion,status:'active',userTokenEncrypted:{not:null},OR:[{expiresAt:null},{expiresAt:{gt:now}}]}},include:{connection:true}});
 if(!page||!await db.socialAccount.findFirst({where:{workspaceId:page.connection.workspaceId,platform:'facebook',providerAccountId:page.pageId,accountType:'page',status:'active'},select:{id:true}}))return false;
 const a={workspaceId:page.connection.workspaceId,platform:'facebook' as const,appId:page.connection.appId,providerAssetId:page.pageId,connectionId:page.connectionId,connectionVersion:page.connection.version},cutoff=new Date(now.getTime()-policy.retentionForAsset(a).contentRetentionDays*86400000);
 if(!Number.isFinite(createdAt.getTime())||createdAt<cutoff)return false;
 if(!source.sourceRecordId)return !await isMetaInboxSourceDeleted(db,{...a,actorId:source.participantId,providerEventId:source.commentId??source.conversationId??'connection',eventKind:source.conversationId?'messages':'comments',occurredAt:createdAt});
 const where={id:source.sourceRecordId,managedPageId:source.managedPageId,connectionVersion:source.connectionVersion,receivedAt:{gte:cutoff},occurredAt:{gte:cutoff}};
 if(source.conversationId){const row=await db.facebookInteractionMessage.findFirst({where:{...where,...(source.participantId?{participantId:source.participantId}:{})}});return !!row&&!await isMetaInboxSourceDeleted(db,{...a,actorId:row.participantId,providerEventId:row.providerId,eventKind:'messages',occurredAt:row.occurredAt});}
 const row=await db.facebookInteractionComment.findFirst({where:{...where,deleted:false,...(source.commentId?{providerId:source.commentId}:{}),...(source.postId?{postId:source.postId}:{})}});return !!row&&!await isMetaInboxSourceDeleted(db,{...a,actorId:row.senderId??undefined,providerEventId:row.providerId,eventKind:'comments',occurredAt:row.occurredAt});
}
export function startInboxRetention(retention:{pruneInbox:(now:Date,limit:number)=>Promise<number>},schedule:typeof setInterval=setInterval){
 let running:Promise<void>|null=null,stopped=false;
 const tick=()=>{if(stopped||running)return;running=(async()=>{try{await retention.pruneInbox(new Date(),50);}catch{/* Retry next bounded maintenance tick; never log customer data. */}})().finally(()=>{running=null;});};
 const timer=schedule(tick,60000);timer.unref?.();tick();
 return{async stop(){stopped=true;clearInterval(timer);await running;}};
}
