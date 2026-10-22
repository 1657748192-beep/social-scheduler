import {createHash,randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient,type InstagramInteractionSendAttempt} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {isPlatformAdmin} from '../utils/platformAdmin';
import {requireInstagramAccount} from './store';
import type {ResolvedAsset,SendOutcome,SourceRef} from '../interactionInbox/types';
import {parseInboxSource} from '../interactionInbox/source';
import {copyInstagramReplyRecording,requireInstagramRecordingTarget,type InstagramReplyRecording} from './replyRecording';
type Input={asset:ResolvedAsset;source?:SourceRef;requestKey:string;kind:'message'|'comment';targetId:string;text:string};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function outcome(row:InstagramInteractionSendAttempt,replayed=false):SendOutcome{
 if(row.status==='sent'&&row.providerId)return{status:'sent',providerId:row.providerId,...(replayed?{replayed:true as const}:{})};
 if(row.status==='failed')return{status:'failed',code:'reply_failed',diagnosticId:row.diagnosticId!};
 return{status:'unknown',diagnosticId:row.diagnosticId!};
}
export function createInstagramSendExecutor({db,testRestriction,now=()=>new Date()}:{db:PrismaClient;testRestriction?:InstagramReplyRecording|null;now?:()=>Date}){
 const rule=copyInstagramReplyRecording(testRestriction);
 async function restricted(store:PrismaClient|Prisma.TransactionClient,input:Input){
  if(!rule)return;
  const target=await requireInstagramRecordingTarget(store,rule,input.asset,input.source,input.text,now());
  if(target.kind!==input.kind||target.targetId!==input.targetId)throw new HttpError(403,'Controlled Instagram reply target unavailable');
 }
 async function current(input:Input){
  const {asset}=input,source=parseInboxSource(asset.sourceRef,'instagram');
  if(asset.ctx.accountIds&&!asset.ctx.accountIds.includes(asset.accountId))throw new HttpError(403,'Instagram account selection denied');
  if(asset.platform!=='instagram'||source.connectionVersion!==asset.connectionVersion||source.instagramAccountId!==asset.accountId)throw new HttpError(409,'Independent Instagram connection changed');
  const account=await requireInstagramAccount(db,asset.ctx,asset.accountId,'manage');
  if(account.providerAccountId!==asset.providerAssetId)throw new HttpError(409,'Independent Instagram account changed');
  const c=await db.instagramManagementConnection.findFirst({where:{id:source.connectionId,workspaceId:asset.ctx.workspaceId,appId:asset.appNamespace,providerAccountId:asset.providerAssetId,version:asset.connectionVersion,status:'active',tokenEncrypted:{not:null}}});
  const needed=['instagram_business_basic',input.kind==='message'?'instagram_business_manage_messages':'instagram_business_manage_comments'];
  if(!c||c.expiresAt&&c.expiresAt<=new Date()||needed.some(s=>!c.scopes.includes(s)))throw new HttpError(409,'Independent Instagram grant unavailable');
  const authorizer=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:asset.ctx.workspaceId,userId:c.userId}},include:{user:{select:{email:true}}}});
  if(!authorizer||authorizer.status!=='active'||!['owner','admin'].includes(authorizer.role)||!isPlatformAdmin(authorizer.user.email))throw new HttpError(403,'Independent Instagram authorizer unavailable');
  return c;
 }
 return{async execute(input:Input,send:()=>Promise<SendOutcome>):Promise<SendOutcome>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestKey)||!['message','comment'].includes(input.kind)||typeof input.text!=='string'||!input.text.trim()||input.text.length>(input.kind==='message'?2000:8000)||!/^[-a-zA-Z0-9_:.]{1,256}$/.test(input.targetId)||input.targetId===input.asset.providerAssetId)throw new HttpError(400,'Invalid Instagram reply');
  await restricted(db,input);
  const c=await current(input),key={connectionId:c.id,connectionVersion:c.version,requestKey:input.requestKey},targetHash=hash([input.kind,input.targetId]),payloadHash=hash(input.text);
  let attempt:InstagramInteractionSendAttempt;
  const data={...key,workspaceId:c.workspaceId,targetHash,payloadHash,diagnosticId:randomUUID()};
  try{
   if(rule){
    const admitted=await db.$transaction(async tx=>{
     // Durable admission is serialized across request keys and executor instances.
     // Never hold this lock over a provider request. Every prior status consumes the slot.
     await tx.$queryRaw`SELECT id FROM "InstagramManagementConnection" WHERE id=${c.id}::uuid FOR UPDATE`;
     await restricted(tx,input);
     const previous=await tx.instagramInteractionSendAttempt.findFirst({where:{workspaceId:c.workspaceId,connectionId:c.id,targetHash},orderBy:[{createdAt:'asc'},{id:'asc'}]});
     // Any previous payload consumes the slot, but only the exact payload may
     // reuse its receipt. Never relabel an older different reply as this demo.
     const samePayload=previous?.payloadHash===payloadHash;
     const row=await tx.instagramInteractionSendAttempt.create({data:previous?{...data,status:!samePayload||previous.status==='pending'?'unknown':previous.status,providerId:samePayload?previous.providerId:null}:data});
     return{row,fresh:!previous};
    });
    if(!admitted.fresh)return outcome(admitted.row,true);
    attempt=admitted.row;
   }else attempt=await db.instagramInteractionSendAttempt.create({data});
  }
  catch(error){
   if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=='P2002')throw error;
   const row=await db.instagramInteractionSendAttempt.findUnique({where:{connectionId_connectionVersion_requestKey:key}});
   if(!row||row.workspaceId!==c.workspaceId)throw new HttpError(409,'Instagram send unavailable');
   if(row.targetHash!==targetHash||row.payloadHash!==payloadHash)throw new HttpError(409,'Request key already used with different input');
   return outcome(row,!!rule);
  }
  // Persist the claim before dispatch; uncertainty is terminal, never an automatic retry.
  try{await current(input);await restricted(db,input);}catch(error){await db.instagramInteractionSendAttempt.updateMany({where:{id:attempt.id,status:'pending'},data:{status:'failed'}});throw error;}
  let result:SendOutcome;
  try{
   result=await send();
   if(result.status==='sent'&&!/^[-a-zA-Z0-9_:.]{1,256}$/.test(result.providerId))result={status:'unknown',diagnosticId:attempt.diagnosticId!};
   if(!['sent','failed','unknown'].includes(result.status))result={status:'unknown',diagnosticId:attempt.diagnosticId!};
   try{await current(input);}catch{result={status:'unknown',diagnosticId:attempt.diagnosticId!};}
  }catch{result={status:'unknown',diagnosticId:attempt.diagnosticId!};}
  try{
   const changed=await db.instagramInteractionSendAttempt.updateMany({where:{id:attempt.id,workspaceId:c.workspaceId,connectionId:c.id,connectionVersion:c.version,status:'pending'},data:{status:result.status,providerId:result.status==='sent'?result.providerId:null}});
   if(changed.count!==1)return{status:'unknown',diagnosticId:attempt.diagnosticId!};
   return result.status==='sent'?result:result.status==='failed'?{status:'failed',code:'reply_failed',diagnosticId:attempt.diagnosticId!}:{status:'unknown',diagnosticId:attempt.diagnosticId!};
  }catch{return{status:'unknown',diagnosticId:attempt.diagnosticId!};}
 }};
}
