import {createHash,randomUUID} from 'node:crypto';import type {PrismaClient,Prisma,InstagramReplyRecordingGrant} from '@prisma/client';
import {HttpError} from '../utils/errors';import {isPlatformAdmin} from '../utils/platformAdmin';import {requireInstagramAccount} from './store';
import type {ResolvedAsset,SourceRef,SendOutcome} from '../interactionInbox/types';import type {InstagramSendInput} from './sendAttempts';import type {LiveInboxPolicy} from '../interactionInbox/livePolicy';import {parseInboxSource} from '../interactionInbox/source';
import {copyInstagramReplyRecording,requireInstagramRecordingTarget,type InstagramReplyRecording} from './replyRecording';import type {InstagramSourceSubject} from './types';
import {instagramRecordingIncomingKey,REC3_MAX_AGE_MS,REC3_MARKER,REC3_TEXT} from './recordingGrantIdentity';
export type Rec3GrantDeps={db:PrismaClient;rule:InstagramReplyRecording;policy:LiveInboxPolicy;now:()=>Date;isDeleted:(tx:Prisma.TransactionClient,subject:InstagramSourceSubject)=>Promise<boolean>};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const denied=()=>new HttpError(409,'REC3 manual reply qualification unavailable');
export function createInstagramRecordingGrants({db,rule:input,policy,now,isDeleted}:Rec3GrantDeps){
 const rule=copyInstagramReplyRecording(input)!;
 function key(a:ResolvedAsset,s:SourceRef){if(!rule.messageRec3||s.sourceRecordId!==rule.messageRec3.sourceRecordId)throw denied();return instagramRecordingIncomingKey({workspaceId:a.ctx.workspaceId,appId:a.appNamespace,providerAccountId:a.providerAssetId,providerEventId:rule.messageRec3.providerEventId});}
 async function verify(tx:Prisma.TransactionClient,a:ResolvedAsset,value:SourceRef,existing?:InstagramReplyRecordingGrant|null,reading=false){
  const s=parseInboxSource(value,'instagram'),own=parseInboxSource(a.sourceRef,'instagram');
  if(!rule.messageRec3||s.sourceRecordId!==rule.messageRec3.sourceRecordId||own.connectionId!==s.connectionId||own.connectionVersion!==s.connectionVersion||a.ctx.userId!==rule.userId)throw denied();
  await requireInstagramAccount(tx,a.ctx,a.accountId,'manage');await requireInstagramRecordingTarget(tx,rule,a,s,undefined,now(),reading);
  const account=await tx.socialAccount.findUniqueOrThrow({where:{id:a.accountId}}),c=await tx.instagramManagementConnection.findUnique({where:{id:s.connectionId}}),at=now();
  if(!c||c.workspaceId!==a.ctx.workspaceId||c.appId!==a.appNamespace||c.providerAccountId!==a.providerAssetId||c.version!==a.connectionVersion||c.status!=='active'||!c.tokenEncrypted||c.expiresAt&&c.expiresAt<=at||!['instagram_business_basic','instagram_business_manage_messages'].every(v=>c.scopes.includes(v)))throw denied();
  const authorizer=await tx.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:c.workspaceId,userId:c.userId}},include:{user:{select:{email:true}}}});
  if(!authorizer||authorizer.status!=='active'||!['owner','admin'].includes(authorizer.role)||!isPlatformAdmin(authorizer.user.email)||account.providerAccountId!==c.providerAccountId)throw denied();
  const evidence=policy.requireAsset({workspaceId:a.ctx.workspaceId,platform:'instagram',appId:a.appNamespace,providerAssetId:a.providerAssetId},reading?'read':'send');
  const row=await tx.instagramInteractionMessage.findUniqueOrThrow({where:{id:s.sourceRecordId!}}),age=+at-+row.occurredAt,retention=evidence.contentRetentionDays*86400000;
  if(!Number.isFinite(age)||age<0||age>=retention||+row.receivedAt<+at-retention||!reading&&(age>=REC3_MAX_AGE_MS||age>=evidence.replyWindowMs))throw denied();
  if(await isDeleted(tx,{workspaceId:c.workspaceId,platform:'instagram',appId:c.appId,providerAssetId:c.providerAccountId,actorId:row.actorId,providerEventId:row.providerId,eventKind:'messages',occurredAt:row.occurredAt,connectionId:c.id,connectionVersion:c.version}))throw denied();
  const candidates=await tx.instagramInteractionMessage.count({where:{workspaceId:c.workspaceId,connectionId:c.id,connectionVersion:c.version,inbound:true,deleted:false,text:{startsWith:REC3_MARKER+' '}}});if(candidates!==1)throw denied();
  const targetHash=hash(['message',row.actorId]);
  const history=await tx.instagramInteractionSendAttempt.findMany({where:{workspaceId:c.workspaceId,connectionId:c.id,OR:[{targetHash},{targetHash:'deleted'}],...(existing?.attemptId?{id:{not:existing.attemptId}}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  if(history.some(v=>['pending','unknown'].includes(v.status)||v.targetHash==='deleted'))throw denied();
  const predecessor=history.find(v=>v.status==='sent');if(!predecessor?.providerId||predecessor.connectionVersion!==c.version||+predecessor.updatedAt>=+row.occurredAt||+predecessor.updatedAt>+at)throw denied();
  if(await tx.instagramInteractionSendAttempt.findFirst({where:{connectionId:c.id,providerId:predecessor.providerId,OR:[{createdAt:{lt:predecessor.createdAt}},{createdAt:predecessor.createdAt,id:{lt:predecessor.id}}]}}))throw denied();
  if(!await tx.interactionAudit.findFirst({where:{workspaceId:c.workspaceId,action:'instagram.reply.original',targetId:c.id,result:c.version+':'+predecessor.requestKey}}))throw denied();
  const ownAttempt=existing?.attemptId?await tx.instagramInteractionSendAttempt.findUnique({where:{id:existing.attemptId}}):null;
  const ownReply=ownAttempt?.status==='sent'&&ownAttempt.payloadHash===existing?.payloadHash?ownAttempt.providerId:null;
  if(await tx.instagramInteractionMessage.findFirst({where:{workspaceId:c.workspaceId,connectionId:c.id,connectionVersion:c.version,conversationId:row.conversationId,inbound:false,deleted:false,occurredAt:{gte:row.occurredAt},...(ownReply?{providerId:{not:ownReply}}:{})}}))throw denied();
  const expiresAt=new Date(Math.min(Date.parse(rule.messageRec3.expiresAt),+row.occurredAt+REC3_MAX_AGE_MS,+row.occurredAt+evidence.replyWindowMs,+row.occurredAt+retention));
  if(!reading&&+expiresAt<=+at)throw denied();
  if(existing&&(existing.state==='closed'||existing.accountId!==a.accountId||existing.connectionId!==c.id||existing.connectionVersion!==c.version||existing.sourceRecordId!==row.id||existing.providerEventId!==row.providerId||existing.actorId!==row.actorId||existing.conversationId!==row.conversationId||existing.predecessorAttemptId!==predecessor.id||existing.payloadHash!==hash(REC3_TEXT)||+existing.expiresAt!==+expiresAt))throw denied();
  return{row,c,predecessor,expiresAt,retention};
 }
 return{
  async prepare(a:ResolvedAsset,s:SourceRef){return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${a.sourceRef!.connectionId}::uuid FOR UPDATE`;
   const incomingKey=key(a,s),existing=await tx.instagramReplyRecordingGrant.findUnique({where:{incomingKey}}),v=await verify(tx,a,s,existing);
   if(existing)return existing;
   return tx.instagramReplyRecordingGrant.create({data:{incomingKey,workspaceId:a.ctx.workspaceId,appId:a.appNamespace,providerAccountId:a.providerAssetId,accountId:a.accountId,userId:a.ctx.userId,connectionId:v.c.id,connectionVersion:v.c.version,sourceRecordId:v.row.id,providerEventId:v.row.providerId,actorId:v.row.actorId,conversationId:v.row.conversationId,occurredAt:v.row.occurredAt,predecessorAttemptId:v.predecessor.id,predecessorProviderId:v.predecessor.providerId,marker:REC3_MARKER,payloadHash:hash(REC3_TEXT),expiresAt:v.expiresAt,forgetAfter:new Date(Math.max(+v.row.occurredAt+REC3_MAX_AGE_MS,+v.expiresAt,+v.row.occurredAt+v.retention))}});
  });},
  async read(a:ResolvedAsset,s:SourceRef){return db.$transaction(async tx=>{const row=await tx.instagramReplyRecordingGrant.findUnique({where:{incomingKey:key(a,s)}});if(!row)return null;try{await verify(tx,a,s,row,true);return row;}catch{return null;}});},
  async claim(input:InstagramSendInput){return db.$transaction(async tx=>{
   if(input.kind!=='message'||input.text!==REC3_TEXT||!input.source)throw denied();
   const a=input.asset,s=input.source;await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${a.sourceRef!.connectionId}::uuid FOR UPDATE`;
   const incomingKey=key(a,s);await tx.$queryRaw`SELECT id FROM "InstagramReplyRecordingGrant" WHERE "incomingKey"=${incomingKey} FOR UPDATE`;
   const g=await tx.instagramReplyRecordingGrant.findUnique({where:{incomingKey}});if(!g||input.targetId!==g.actorId)throw denied();
   await verify(tx,a,s,g,!!g.attemptId);
   const oldKey=await tx.instagramInteractionSendAttempt.findUnique({where:{connectionId_connectionVersion_requestKey:{connectionId:rule.connectionId,connectionVersion:rule.connectionVersion,requestKey:input.requestKey}}});
   if(oldKey&&oldKey.id!==g.attemptId)throw denied();
   if(g.attemptId){const attempt=await tx.instagramInteractionSendAttempt.findUnique({where:{id:g.attemptId}});if(!attempt||attempt.workspaceId!==g.workspaceId||attempt.payloadHash!==g.payloadHash||attempt.targetHash!==hash(['message',g.actorId]))throw denied();return{fresh:false,attempt};}
   if(g.state!=='available'||+g.expiresAt<=+now())throw denied();
   const attempt=await tx.instagramInteractionSendAttempt.create({data:{workspaceId:g.workspaceId,connectionId:rule.connectionId,connectionVersion:rule.connectionVersion,requestKey:input.requestKey,targetHash:hash(['message',g.actorId]),payloadHash:g.payloadHash!,diagnosticId:randomUUID()}});
   await tx.instagramReplyRecordingGrant.update({where:{id:g.id},data:{state:'claimed',attemptId:attempt.id,claimedAt:now()}});return{fresh:true,attempt};
  });},
  async finish(attemptId:string,result:SendOutcome):Promise<SendOutcome>{
   const unknown={status:'unknown' as const,diagnosticId:'pending-verification'};
   try{return await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${rule.connectionId}::uuid FOR UPDATE`;
    const g=await tx.instagramReplyRecordingGrant.findUnique({where:{attemptId}});if(!g||g.workspaceId!==rule.workspaceId||g.connectionId!==rule.connectionId||g.connectionVersion!==rule.connectionVersion||g.state!=='claimed')return unknown;
    const attempt=await tx.instagramInteractionSendAttempt.findUnique({where:{id:attemptId}});if(!attempt||attempt.status!=='pending'||attempt.workspaceId!==g.workspaceId||attempt.payloadHash!==g.payloadHash||attempt.targetHash!==hash(['message',g.actorId]))return unknown;
    const valid=result.status==='sent'&&/^[-a-zA-Z0-9_:.]{1,256}$/.test(result.providerId),status=valid?'sent':result.status==='failed'?'failed':'unknown';
    await tx.instagramInteractionSendAttempt.update({where:{id:attempt.id},data:{status,providerId:valid?result.providerId:null}});
    await tx.instagramReplyRecordingGrant.update({where:{id:g.id},data:{state:status}});
    return valid?result:status==='failed'?{status:'failed',code:'reply_failed',diagnosticId:attempt.diagnosticId!}:{status:'unknown',diagnosticId:attempt.diagnosticId!};
   });}catch{return unknown;}
  }
 };
}
