import {createHash,randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient,type InstagramInteractionSendAttempt} from '@prisma/client';
import {HttpError} from '../utils/errors';
import {isPlatformAdmin} from '../utils/platformAdmin';
import {requireInstagramAccount} from './store';
import type {ResolvedAsset,SendOutcome} from '../interactionInbox/types';
import {parseInboxSource} from '../interactionInbox/source';
type Input={asset:ResolvedAsset;requestKey:string;kind:'message'|'comment';targetId:string;text:string};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function outcome(row:InstagramInteractionSendAttempt):SendOutcome{
 if(row.status==='sent'&&row.providerId)return{status:'sent',providerId:row.providerId};
 if(row.status==='failed')return{status:'failed',code:'reply_failed',diagnosticId:row.diagnosticId!};
 return{status:'unknown',diagnosticId:row.diagnosticId!};
}
export function createInstagramSendExecutor({db}:{db:PrismaClient}){
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
  const c=await current(input),key={connectionId:c.id,connectionVersion:c.version,requestKey:input.requestKey},targetHash=hash([input.kind,input.targetId]),payloadHash=hash(input.text);
  let attempt:InstagramInteractionSendAttempt;
  try{attempt=await db.instagramInteractionSendAttempt.create({data:{...key,workspaceId:c.workspaceId,targetHash,payloadHash,diagnosticId:randomUUID()}});}
  catch(error){
   if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=='P2002')throw error;
   const row=await db.instagramInteractionSendAttempt.findUnique({where:{connectionId_connectionVersion_requestKey:key}});
   if(!row||row.workspaceId!==c.workspaceId)throw new HttpError(409,'Instagram send unavailable');
   if(row.targetHash!==targetHash||row.payloadHash!==payloadHash)throw new HttpError(409,'Request key already used with different input');
   return outcome(row);
  }
  // Persist the claim before dispatch; uncertainty is terminal, never an automatic retry.
  try{await current(input);}catch(error){await db.instagramInteractionSendAttempt.updateMany({where:{id:attempt.id,status:'pending'},data:{status:'failed'}});throw error;}
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
