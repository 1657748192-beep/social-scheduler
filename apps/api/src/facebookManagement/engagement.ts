import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import {FacebookEngagementError,type FacebookEngagementClient} from '../integrations/social/facebookEngagement';
import type {FacebookCapabilities,FacebookCapability,FacebookPage,FacebookComment,FacebookMessage,FacebookConversation} from '../integrations/social/facebookEngagementTypes';
import {isFacebookMessagingWindowOpen} from '../integrations/social/facebookMessagingPolicy';
import {HttpError} from '../utils/errors';
import type {PageContext,ReadPage,SendOutcome} from './types';
import type {createFacebookPageAccess} from './access';
import type {createFacebookSendExecutor} from './sendAttempts';
import {copyReplyTestRestriction,assertReplyTestContext,assertReplyTestGrant,assertReplyTestInput,type FacebookReplyTestRestriction} from './replyTestRestriction';

type Access=Awaited<ReturnType<ReturnType<typeof createFacebookPageAccess>['resolvePageAccess']>>;
type Client=Pick<FacebookEngagementClient,'getPostIdentity'|'listConversations'|'getConversation'|'listMessages'|'listComments'|'replyComment'|'sendMessage'>;
type Dependencies={db:PrismaClient;testRestriction?:FacebookReplyTestRestriction|null;resolvePageAccess:ReturnType<typeof createFacebookPageAccess>['resolvePageAccess'];executeFacebookSend:ReturnType<typeof createFacebookSendExecutor>['executeFacebookSend'];
  createClient:(input:{pageId:string;accessToken:string})=>Client;now?:()=>Date;latestInbound?:(managedPageId:string,participantId:string)=>Promise<Date|null>;
  receivedMessages?:(managedPageId:string,participantId:string,conversationId:string)=>Promise<FacebookMessage[]>;
  receivedComments?:(managedPageId:string,postId:string,ids:string[],recent:boolean)=>Promise<FacebookComment[]>};
function permissions(access:Access):FacebookCapabilities{
  const state=(scopes:string[],tasks:string[],write=false)=>({status:(scopes.every(s=>access.scopes.includes(s))&&tasks.some(t=>access.tasks.includes(t))&&(!write||access.role!=='viewer')?'available':'missing') as 'available'|'missing'});
  return {readComments:state(['pages_read_engagement','pages_read_user_content'],['MODERATE']),replyComments:state(['pages_read_user_content','pages_manage_engagement'],['MODERATE'],true),
    readMessages:state(['pages_read_engagement','pages_manage_metadata','pages_messaging'],['MESSAGING','MODERATE']),replyMessages:state(['pages_messaging'],['MESSAGING'],true),subscription:state(['pages_manage_metadata'],['MANAGE'])};
}
function validateAfter(after?:string){if(after!==undefined&&(!after||after.length>2048||/[\x00-\x20\x7f]/.test(after)))throw new HttpError(400,'Invalid pagination cursor');}
function validateText(text:string,max:number){if(typeof text!=='string'||!text.trim()||text.length>max)throw new HttpError(400,'Invalid reply text');}
export function createFacebookManagementEngagement(deps:Dependencies){
  const now=deps.now??(()=>new Date());
  const rule=copyReplyTestRestriction(deps.testRestriction);
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
    assertReplyTestContext(rule,ctx,now());
    if(rule&&!(rule.kind==='comment'?['readComments','replyComments']:['readMessages','replyMessages']).includes(capability))throw new HttpError(403,'Only the controlled reply test is enabled');
    const access=await deps.resolvePageAccess(ctx,{write,requirePublishingBinding:true});
    assertReplyTestGrant(rule,access);
    if(permissions(access)[capability].status!=='available')throw new HttpError(403,'Facebook Page permission or task is missing');
    return {access,api:deps.createClient({pageId:access.pageId,accessToken:access.pageToken})};
  }
  function wrap<T>(page:FacebookPage<T>):ReadPage<T>{
    if(!Array.isArray(page.items)||page.items.length>25)throw new HttpError(502,'Facebook returned invalid pagination');
    if(page.nextCursor!==null)validateAfter(page.nextCursor);
    return {...page,readAt:now().toISOString(),source:'graph',stale:false,warnings:[]};
  }
  async function conversation(api:Client,id:string,access:Access){
    if(rule&&(rule.kind==='comment'||id!==rule.conversationId))throw new HttpError(403,'Conversation is outside the controlled test');
    const item=await api.getConversation(id);
    if(item.id!==id||!/^\d{1,256}$/.test(item.counterpartyId)||item.counterpartyId===access.pageId)throw new HttpError(404,'Conversation unavailable for this Page');
    if(rule&&item.counterpartyId!==rule.participantId)throw new HttpError(403,'Controlled conversation participant changed');
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
  async function published(ctx:PageContext,access:Access,scheduleId:string,allowHistorical=false){
    const schedule=await deps.db.schedule.findFirst({where:{id:scheduleId,workspaceId:ctx.workspaceId,status:'published'},include:{postVariant:{include:{post:true}},publishJobs:{where:{status:'succeeded'},orderBy:{createdAt:'desc'}}}});
    if(!schedule||schedule.postVariant.post.workspaceId!==ctx.workspaceId||schedule.postVariant.platform!=='facebook'||schedule.postVariant.socialAccountId!==access.publishingAccountId)throw new HttpError(404,'Published Facebook post unavailable');
    const job=schedule.publishJobs[0];
    const simulated=job?.rawResponse&&typeof job.rawResponse==='object'&&!Array.isArray(job.rawResponse)&&'simulated' in job.rawResponse&&job.rawResponse.simulated===true;
    if(!job?.providerPostId||!(new RegExp(`^${access.pageId}_[0-9]+$`).test(job.providerPostId)||allowHistorical&&/^\d{1,256}$/.test(job.providerPostId))||simulated)throw new HttpError(409,'Verified Facebook post identity is unavailable');
    return job.providerPostId;
  }
  async function verifiedHistorical(api:Client,access:Access,storedId:string){
    const remote=await api.getPostIdentity(storedId);
    if(remote.pageId!==access.pageId||!new RegExp(`^${access.pageId}_[0-9]+$`).test(remote.id)||
      (storedId.includes('_')?remote.id!==storedId:remote.id.split('_')[1]!==storedId&&remote.sourceId!==storedId))return null;
    return remote.id;
  }
  async function send(access:Access,action:()=>Promise<SendOutcome>):Promise<SendOutcome>{
    try{return await provider(access,action);}catch(error){
      if(error instanceof HttpError&&[403,409].includes(error.statusCode))return{status:'failed',code:error.statusCode===403?'permission_missing':'authorization_invalid',diagnosticId:randomUUID()};
      return{status:'unknown',diagnosticId:randomUUID()};
    }
  }
  return {
    commentReadScheduleId:rule?.kind==='comment'?rule.scheduleId:null,
    async postAvailability(ctx:PageContext,scheduleId:string){
      if(rule&&(rule.kind!=='comment'||scheduleId!==rule.scheduleId))throw new HttpError(403,'Post is outside the controlled comment test');
      const {access,api}=await authorized(ctx,'readComments'),storedId=await published(ctx,access,scheduleId,true);
      // Read only: do not invalidate grants, repair records, or infer deletion from 100/33.
      let status:string;
      try{
        const postId=await verifiedHistorical(api,access,storedId);
        if(postId&&(!rule||rule.kind==='comment'&&postId===rule.postId)){wrap(await api.listComments(postId));status='readable';}else status='identity_unverified';
      }
      catch(error){if(!(error instanceof FacebookEngagementError))throw error;status=error.kind;}
      return {status,checkedAt:now().toISOString()};
    },
    async capabilities(ctx:PageContext){
      assertReplyTestContext(rule,ctx,now());
      const access=await deps.resolvePageAccess(ctx,{requirePublishingBinding:true});assertReplyTestGrant(rule,access);
      const caps=permissions(access);if(rule)for(const key of (rule.kind==='comment'?['readMessages','replyMessages','subscription']:['readComments','replyComments','subscription']) as Array<keyof FacebookCapabilities>)caps[key]={status:'missing'};
      return caps;
    },
    async conversations(ctx:PageContext,after?:string){
      validateAfter(after);const {access,api}=await authorized(ctx,'readMessages');
      if(rule&&rule.kind!=='comment')return provider(access,async()=>wrap({items:after?[]:[await conversation(api,rule.conversationId,access)],nextCursor:null}));
      return provider(access,async()=>wrap(await api.listConversations(after)));
    },
    async messages(ctx:PageContext,conversationId:string,after?:string){
      validateAfter(after);const {access,api}=await authorized(ctx,'readMessages');
      return provider(access,async()=>{
        const item=await conversation(api,conversationId,access),remote=wrap(messagesFor(await api.listMessages(conversationId,after),item,access));
        const local=!after&&deps.receivedMessages?await deps.receivedMessages(access.managedPageId,item.counterpartyId,item.id):[];
        messagesFor({items:local,nextCursor:null},item,access);
        const merged=new Map(remote.items.map(message=>[message.id,message]));for(const message of local)merged.set(message.id,message);
        return {...remote,items:[...merged.values()].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)),source:local.length?'mixed' as const:remote.source};
      });
    },
    async comments(ctx:PageContext,scheduleId:string,after?:string){
      if(rule&&(rule.kind!=='comment'||scheduleId!==rule.scheduleId))throw new HttpError(403,'Post is outside the controlled comment test');
      validateAfter(after);const {access,api}=await authorized(ctx,'readComments');const storedId=await published(ctx,access,scheduleId,true);
      const postId=storedId.includes('_')?storedId:await provider(access,()=>verifiedHistorical(api,access,storedId));
      if(!postId)throw new HttpError(409,'Verified Facebook post identity is unavailable');
      if(rule&&rule.kind==='comment'&&postId!==rule.postId)throw new HttpError(403,'Controlled post identity changed');
      return provider(access,async()=>{
        const remote=wrap(await api.listComments(postId,after));
        const local=await deps.receivedComments?.(access.managedPageId,postId,remote.items.map(c=>c.id),!after)??[];
        const merged=new Map(remote.items.map(comment=>[comment.id,comment]));
        // Graph timestamps are creation times; webhook timestamps are event
        // times, so they cannot establish which body is newer. A successful
        // current Graph body wins. Keep local-only arrivals and tombstones.
        for(const comment of local){if(comment.deleted)merged.delete(comment.id);else if(!merged.has(comment.id))merged.set(comment.id,comment);}
        const items=[...merged.values()].filter(c=>!rule||rule.kind==='comment'&&c.id===rule.commentId).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
        return{...remote,items,nextCursor:rule?null:remote.nextCursor,source:local.length?'mixed' as const:remote.source};
      });
    },
    async replyMessage(ctx:PageContext,input:{conversationId:string;text:string;requestKey:string}){
      assertReplyTestContext(rule,ctx,now());assertReplyTestInput(rule,{...input,kind:'message'});
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
        if(fresh.access.connectionId!==access.connectionId||fresh.access.connectionVersion!==access.connectionVersion||fresh.access.pageToken!==access.pageToken)return{status:'failed',code:'authorization_changed',diagnosticId:randomUUID()};
        if(permissions(fresh.access).readMessages.status!=='available')return{status:'failed',code:'permission_missing',diagnosticId:randomUUID()};
        if(!isFacebookMessagingWindowOpen(latest,now()))return{status:'failed',code:'reply_window_closed',diagnosticId:randomUUID()};
        assertReplyTestContext(rule,ctx,now());
        return send(fresh.access,()=>fresh.api.sendMessage(item.counterpartyId,input.text));
      });
    },
    async replyComment(ctx:PageContext,input:{scheduleId:string;commentId:string;text:string;requestKey:string}){
      assertReplyTestContext(rule,ctx,now());assertReplyTestInput(rule,{...input,kind:'comment'});
      validateText(input.text,8000);const {access,api}=await authorized(ctx,'replyComments',true);const storedId=await published(ctx,access,input.scheduleId,true);
      const postId=storedId.includes('_')?storedId:await provider(access,()=>verifiedHistorical(api,access,storedId));
      if(!postId)throw new HttpError(409,'Verified Facebook post identity is unavailable');
      if(rule&&rule.kind==='comment'&&postId!==rule.postId)throw new HttpError(403,'Controlled post identity changed');
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
        const fresh=await authorized(ctx,'replyComments',true);const freshStored=await published(ctx,fresh.access,input.scheduleId,true);
        if(freshStored!==storedId||!storedId.includes('_')&&await provider(fresh.access,()=>verifiedHistorical(fresh.api,fresh.access,freshStored))!==postId)return{status:'failed',code:'post_identity_changed',diagnosticId:randomUUID()};
        if(fresh.access.connectionId!==access.connectionId||fresh.access.connectionVersion!==access.connectionVersion||fresh.access.pageToken!==access.pageToken)return{status:'failed',code:'authorization_changed',diagnosticId:randomUUID()};
        const dispatch=storedId.includes('_')?fresh:await authorized(ctx,'replyComments',true);
        if(dispatch.access.connectionId!==access.connectionId||dispatch.access.connectionVersion!==access.connectionVersion||dispatch.access.pageToken!==access.pageToken)return{status:'failed',code:'authorization_changed',diagnosticId:randomUUID()};
        assertReplyTestContext(rule,ctx,now());
        return send(dispatch.access,()=>dispatch.api.replyComment(input.commentId,input.text));
      });
    }
  };
}
