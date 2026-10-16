import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import {FacebookEngagementError,type FacebookEngagementClient} from '../integrations/social/facebookEngagement';
import type {FacebookCapabilities,FacebookCapability,FacebookPage,FacebookComment,FacebookMessage,FacebookConversation} from '../integrations/social/facebookEngagementTypes';
import {isFacebookMessagingWindowOpen} from '../integrations/social/facebookMessagingPolicy';
import {HttpError} from '../utils/errors';
import type {PageContext,ReadPage,SendOutcome} from './types';
import type {createFacebookPageAccess} from './access';
import type {createFacebookSendExecutor} from './sendAttempts';

type Access=Awaited<ReturnType<ReturnType<typeof createFacebookPageAccess>['resolvePageAccess']>>;
type Client=Pick<FacebookEngagementClient,'listConversations'|'getConversation'|'listMessages'|'listComments'|'replyComment'|'sendMessage'>;
type Dependencies={db:PrismaClient;resolvePageAccess:ReturnType<typeof createFacebookPageAccess>['resolvePageAccess'];executeFacebookSend:ReturnType<typeof createFacebookSendExecutor>['executeFacebookSend'];
  createClient:(input:{pageId:string;accessToken:string})=>Client;now?:()=>Date;latestInbound?:(managedPageId:string,participantId:string)=>Promise<Date|null>};
function permissions(access:Access):FacebookCapabilities{
  const state=(scopes:string[],tasks:string[],write=false)=>({status:(scopes.every(s=>access.scopes.includes(s))&&tasks.some(t=>access.tasks.includes(t))&&(!write||access.role!=='viewer')?'available':'missing') as 'available'|'missing'});
  return {readComments:state(['pages_read_engagement','pages_read_user_content'],['MODERATE']),replyComments:state(['pages_read_user_content','pages_manage_engagement'],['MODERATE'],true),
    readMessages:state(['pages_read_engagement','pages_manage_metadata','pages_messaging'],['MESSAGING','MODERATE']),replyMessages:state(['pages_messaging'],['MESSAGING'],true),subscription:state(['pages_manage_metadata'],['MANAGE'])};
}
function validateAfter(after?:string){if(after!==undefined&&(!after||after.length>2048||/[\x00-\x20\x7f]/.test(after)))throw new HttpError(400,'Invalid pagination cursor');}
function validateText(text:string,max:number){if(typeof text!=='string'||!text.trim()||text.length>max)throw new HttpError(400,'Invalid reply text');}
export function createFacebookManagementEngagement(deps:Dependencies){
  const now=deps.now??(()=>new Date());
  async function provider<T>(access:Access,action:()=>Promise<T>):Promise<T>{
    try{return await action();}catch(error){
      if(error instanceof HttpError)throw error;
      if(error instanceof FacebookEngagementError){
        if(error.kind==='authorization_invalid')await deps.db.facebookManagementConnection.updateMany({where:{id:access.connectionId,status:'active',version:access.connectionVersion},data:{status:'authorization_invalid',version:{increment:1}}});
        throw new HttpError(['permission_missing','task_missing','access_level'].includes(error.kind)?403:error.kind==='authorization_invalid'?409:502,`Facebook ${error.kind} (${error.diagnosticId})`);
      }
      throw new HttpError(502,`Facebook read unavailable (${randomUUID()})`);
    }
  }
  async function authorized(ctx:PageContext,capability:FacebookCapability,write=false){
    const access=await deps.resolvePageAccess(ctx,{write,requirePublishingBinding:true});
    if(permissions(access)[capability].status!=='available')throw new HttpError(403,'Facebook Page permission or task is missing');
    return {access,api:deps.createClient({pageId:access.pageId,accessToken:access.pageToken})};
  }
  function wrap<T>(page:FacebookPage<T>):ReadPage<T>{
    if(!Array.isArray(page.items)||page.items.length>25)throw new HttpError(502,'Facebook returned invalid pagination');
    if(page.nextCursor!==null)validateAfter(page.nextCursor);
    return {...page,readAt:now().toISOString(),source:'graph',stale:false,warnings:[]};
  }
  async function conversation(api:Client,id:string,access:Access){
    const item=await api.getConversation(id);
    if(item.id!==id||!/^\d{1,256}$/.test(item.counterpartyId)||item.counterpartyId===access.pageId)throw new HttpError(404,'Conversation unavailable for this Page');
    return item;
  }
  function messagesFor(page:FacebookPage<FacebookMessage>,item:FacebookConversation,access:Access){
    for(const m of page.items){
      const incoming=m.senderId===item.counterpartyId&&m.recipientId===access.pageId;
      const outgoing=m.senderId===access.pageId&&m.recipientId===item.counterpartyId;
      if(m.conversationId!==item.id||!Number.isFinite(Date.parse(m.timestamp))||(!incoming&&!outgoing)||m.inbound!==incoming)throw new HttpError(502,'Facebook returned an inconsistent message identity');
    }
    return page;
  }
  async function published(ctx:PageContext,access:Access,scheduleId:string){
    const schedule=await deps.db.schedule.findFirst({where:{id:scheduleId,workspaceId:ctx.workspaceId,status:'published'},include:{postVariant:{include:{post:true}},publishJobs:{where:{status:'succeeded'},orderBy:{createdAt:'desc'}}}});
    if(!schedule||schedule.postVariant.post.workspaceId!==ctx.workspaceId||schedule.postVariant.platform!=='facebook'||schedule.postVariant.socialAccountId!==access.publishingAccountId)throw new HttpError(404,'Published Facebook post unavailable');
    const job=schedule.publishJobs[0];
    const simulated=job?.rawResponse&&typeof job.rawResponse==='object'&&!Array.isArray(job.rawResponse)&&'simulated' in job.rawResponse&&job.rawResponse.simulated===true;
    if(!job?.providerPostId||!new RegExp(`^${access.pageId}_[0-9]+$`).test(job.providerPostId)||simulated)throw new HttpError(409,'Verified Facebook post identity is unavailable');
    return job.providerPostId;
  }
  async function send(access:Access,action:()=>Promise<SendOutcome>):Promise<SendOutcome>{
    try{return await provider(access,action);}catch(error){
      if(error instanceof HttpError&&[403,409].includes(error.statusCode))return{status:'failed',code:error.statusCode===403?'permission_missing':'authorization_invalid',diagnosticId:randomUUID()};
      return{status:'unknown',diagnosticId:randomUUID()};
    }
  }
  return {
    async capabilities(ctx:PageContext){return permissions(await deps.resolvePageAccess(ctx,{requirePublishingBinding:true}));},
    async conversations(ctx:PageContext,after?:string){
      validateAfter(after);const {access,api}=await authorized(ctx,'readMessages');
      return provider(access,async()=>wrap(await api.listConversations(after)));
    },
    async messages(ctx:PageContext,conversationId:string,after?:string){
      validateAfter(after);const {access,api}=await authorized(ctx,'readMessages');
      return provider(access,async()=>{const item=await conversation(api,conversationId,access);return wrap(messagesFor(await api.listMessages(conversationId,after),item,access));});
    },
    async comments(ctx:PageContext,scheduleId:string,after?:string){
      validateAfter(after);const {access,api}=await authorized(ctx,'readComments');const postId=await published(ctx,access,scheduleId);
      return provider(access,async()=>wrap(await api.listComments(postId,after)));
    },
    async replyMessage(ctx:PageContext,input:{conversationId:string;text:string;requestKey:string}){
      validateText(input.text,2000);const {access,api}=await authorized(ctx,'replyMessages',true);
      if(permissions(access).readMessages.status!=='available')throw new HttpError(403,'Facebook conversation read permission is missing');
      const item=await provider(access,()=>conversation(api,input.conversationId,access));
      const page=await provider(access,async()=>messagesFor(await api.listMessages(item.id),item,access));
      const current=now();const times=page.items.filter(m=>m.inbound&&m.senderId===item.counterpartyId&&m.recipientId===access.pageId).map(m=>new Date(m.timestamp)).filter(t=>Number.isFinite(t.getTime())&&t<=current);
      const local=await deps.latestInbound?.(access.managedPageId,item.counterpartyId);if(local&&Number.isFinite(local.getTime())&&local<=current)times.push(local);
      const latest=times.sort((a,b)=>b.getTime()-a.getTime())[0]??null;
      if(!isFacebookMessagingWindowOpen(latest,current))throw new HttpError(409,'Verified 24-hour reply window is closed or unknown; use the official inbox');
      return deps.executeFacebookSend(ctx,{requestKey:input.requestKey,targetId:item.counterpartyId,kind:'message',text:input.text},async()=>{
        const fresh=await authorized(ctx,'replyMessages',true);
        if(permissions(fresh.access).readMessages.status!=='available')return{status:'failed',code:'permission_missing',diagnosticId:randomUUID()};
        if(!isFacebookMessagingWindowOpen(latest,now()))return{status:'failed',code:'reply_window_closed',diagnosticId:randomUUID()};
        return send(fresh.access,()=>fresh.api.sendMessage(item.counterpartyId,input.text));
      });
    },
    async replyComment(ctx:PageContext,input:{scheduleId:string;commentId:string;text:string;requestKey:string}){
      validateText(input.text,8000);const {access,api}=await authorized(ctx,'replyComments',true);const postId=await published(ctx,access,input.scheduleId);
      if(permissions(access).readComments.status!=='available')throw new HttpError(403,'Facebook comment read permission is missing');
      let after:string|undefined,found=false;const seen=new Set<string>();
      for(let i=0;i<100;i++){
        const page=await provider(access,async()=>wrap(await api.listComments(postId,after)));
        found=page.items.some((comment:FacebookComment)=>comment.id===input.commentId&&comment.postId===postId&&!comment.deleted);
        if(found||!page.nextCursor)break;
        if(seen.has(page.nextCursor))throw new HttpError(502,'Facebook comment pagination is inconsistent');
        seen.add(page.nextCursor);after=page.nextCursor;
      }
      if(!found)throw new HttpError(404,'Comment could not be verified on this published post');
      return deps.executeFacebookSend(ctx,{requestKey:input.requestKey,targetId:input.commentId,kind:'comment',text:input.text},async()=>{
        const fresh=await authorized(ctx,'replyComments',true);await published(ctx,fresh.access,input.scheduleId);
        return send(fresh.access,()=>fresh.api.replyComment(input.commentId,input.text));
      });
    }
  };
}
