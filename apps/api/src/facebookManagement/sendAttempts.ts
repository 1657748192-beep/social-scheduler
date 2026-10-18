import {createHash,randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient,type FacebookInteractionSendAttempt} from '@prisma/client';
import type {PageContext,SendOutcome} from './types';
import {requireManagementMember,activeManagementOwner,FacebookPageAccessError} from './access';

type Input={requestKey:string;targetId:string;kind:'message'|'comment';text:string};
export class FacebookSendInputError extends Error{
  constructor(readonly statusCode:400|409){super(statusCode===409?'Request key was already used with different input':'Invalid Facebook reply request');}
}
function outcome(row:FacebookInteractionSendAttempt):SendOutcome{
  if(row.status==='sent'&&row.providerId)return {status:'sent',providerId:row.providerId};
  if(row.status==='failed')return {status:'failed',code:row.errorCode??'reply_failed',diagnosticId:row.diagnosticId!};
  return {status:'unknown',diagnosticId:row.diagnosticId!};
}
export function createFacebookSendExecutor({db}:{db:PrismaClient}){
  return {async executeFacebookSend(ctx:PageContext,input:Input,send:()=>Promise<SendOutcome>):Promise<SendOutcome>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestKey)||!['message','comment'].includes(input.kind)||!input.text.trim()||input.text.length>(input.kind==='message'?2000:8000)||!/^[a-zA-Z0-9_:.\-]{1,512}$/.test(input.targetId))throw new FacebookSendInputError(400);
    await requireManagementMember(db,ctx,true);
    const page=await db.facebookManagedPage.findFirst({where:{id:ctx.managedPageId,active:true,pageTokenEncrypted:{not:null},connection:{workspaceId:ctx.workspaceId,status:'active',userTokenEncrypted:{not:null},user:activeManagementOwner(ctx.workspaceId)}},include:{connection:true}});
    if(!page||page.expiresAt&&page.expiresAt<=new Date()||page.connection.expiresAt&&page.connection.expiresAt<=new Date())throw new FacebookPageAccessError();
    const selection=await db.facebookManagementPageSelection.findUnique({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:page.pageId}}});
    const bound=await db.socialAccount.findFirst({where:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:page.pageId,accountType:'page',status:'active'},select:{id:true}});
    if(selection?.managedPageId!==page.id||!bound)throw new FacebookPageAccessError();
    const hash=createHash('sha256').update(JSON.stringify([input.kind,input.targetId,input.text])).digest('hex');
    const key={managedPageId:ctx.managedPageId,requestKey:input.requestKey};
    let attempt:FacebookInteractionSendAttempt;
    try{attempt=await db.facebookInteractionSendAttempt.create({data:{...key,connectionVersion:page.connection.version,targetHash:createHash('sha256').update(JSON.stringify([input.kind,input.targetId])).digest('hex'),payloadHash:hash,diagnosticId:randomUUID()}});}
    catch(error){
      if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=='P2002')throw error;
      const existing=await db.facebookInteractionSendAttempt.findUnique({where:{managedPageId_requestKey:key}});
      if(!existing)throw new FacebookPageAccessError();
      if(existing.payloadHash!==hash)throw new FacebookSendInputError(409);
      if(existing.status==='pending'&&Date.now()-existing.createdAt.getTime()>=30000){
        await db.facebookInteractionSendAttempt.updateMany({where:{id:existing.id,status:'pending',createdAt:existing.createdAt},data:{status:'unknown'}});
        const current=await db.facebookInteractionSendAttempt.findUnique({where:{id:existing.id}});
        return current?outcome(current):{status:'unknown',diagnosticId:existing.diagnosticId!};
      }
      return outcome(existing);
    }
    // Never hold a database transaction open over the external send. Only this
    // freshly inserted attempt may call it; uncertainty is terminal, not retried.
    let result:SendOutcome;
    try{
      result=await send();
      if(result.status==='sent'&&(typeof result.providerId!=='string'||!result.providerId||result.providerId.length>512))result={status:'unknown',diagnosticId:attempt.diagnosticId!};
      if(result.status==='failed'&&!/^[a-z_]{1,80}$/.test(result.code))result={status:'unknown',diagnosticId:attempt.diagnosticId!};
    }catch{result={status:'unknown',diagnosticId:attempt.diagnosticId!};}
    try{
      const changed=await db.facebookInteractionSendAttempt.updateMany({where:{id:attempt.id,status:'pending',createdAt:attempt.createdAt},data:{status:result.status,
        providerId:result.status==='sent'?result.providerId:null,errorCode:result.status==='failed'?result.code:null}});
      if(changed.count===1)return result.status==='sent'?result:{...result,diagnosticId:attempt.diagnosticId!};
      const current=await db.facebookInteractionSendAttempt.findUnique({where:{id:attempt.id}});
      return current?outcome(current):{status:'unknown',diagnosticId:attempt.diagnosticId!};
    }catch{return {status:'unknown',diagnosticId:attempt.diagnosticId!};}
  }};
}
