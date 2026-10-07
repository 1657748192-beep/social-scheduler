import type { FacebookEngagementClient } from '../integrations/social/facebookEngagement';
import { FacebookEngagementError } from '../integrations/social/facebookEngagement';
import { isFacebookMessagingWindowOpen } from '../integrations/social/facebookMessagingPolicy';
import type { FacebookCapability, FacebookComment, FacebookConversation, FacebookMessage, FacebookPage } from '../integrations/social/facebookEngagementTypes';
import { HttpError } from '../utils/errors';

export type FacebookRequestContext={userId:string;workspaceId:string;socialAccountId:string};
type Account={id:string;workspaceId:string;platform:string;accountType:string|null;providerAccountId:string;status:string;credential:{accessTokenEncrypted:string;scopes:string[]}|null};
type Post={id:string;workspaceId:string;status:string;postVariant:{platform:string;socialAccountId:string|null};publishJobs:Array<{status:string;providerPostId:string|null;rawResponse?:unknown}>};
export function createFacebookEngagementService(deps:{enabled():boolean;apiVersion:string;requireMembership(userId:string,workspaceId:string):Promise<{role:string}>;
  getAccount(workspaceId:string,socialAccountId:string):Promise<Account|null>;getPost(workspaceId:string,scheduleId:string):Promise<Post|null>;
  decrypt(value:string):string;createClient(input:{pageId:string;accessToken:string;apiVersion:string}):FacebookEngagementClient;now():Date;
  latestInbound?(socialAccountId:string,counterpartyId:string):Promise<Date|null>;
  getReceivedConversation?(socialAccountId:string,id:string):Promise<FacebookConversation|null>;
  listReceivedConversations?(socialAccountId:string):Promise<FacebookConversation[]>;
  listReceivedMessages?(socialAccountId:string,id:string,after?:string):Promise<FacebookPage<FacebookMessage>>;
  listReceivedComments?(socialAccountId:string,postId:string,ids:string[],includeRecent:boolean):Promise<FacebookComment[]>;
}) {
  async function authorize(ctx:FacebookRequestContext,write=false){
    if(!deps.enabled())throw new HttpError(404,'Facebook engagement is not enabled.');
    const member=await deps.requireMembership(ctx.userId,ctx.workspaceId);
    if(write && !['owner','admin','editor'].includes(member.role))throw new HttpError(403,'Your workspace role cannot reply.');
  }
  async function account(ctx:FacebookRequestContext){
    const value=await deps.getAccount(ctx.workspaceId,ctx.socialAccountId);
    if(!value?.credential || value.id!==ctx.socialAccountId || value.workspaceId!==ctx.workspaceId || value.platform!=='facebook' || value.accountType!=='page' || value.status!=='active')throw new HttpError(404,'Connected Facebook Page not found.');
    return value;
  }
  const client=(value:Account)=>deps.createClient({pageId:value.providerAccountId,accessToken:deps.decrypt(value.credential!.accessTokenEncrypted),apiVersion:deps.apiVersion});
  async function allowed(api:FacebookEngagementClient,capability:FacebookCapability){
    const status=(await api.inspectCapabilities())[capability];
    if(status.status!=='available')throw new HttpError(status.status==='missing'?403:503,status.status==='missing'?'Facebook permission is missing; use supplemental authorization.':'Facebook permission could not be verified; retry later.');
  }
  async function provider<T>(action:()=>Promise<T>):Promise<T>{
    try{return await action();}catch(error){
      if(error instanceof FacebookEngagementError)throw new HttpError(['permission_missing','task_missing','access_level'].includes(error.kind)?403:error.kind==='authorization_invalid'?409:502,error.message);
      throw error;
    }
  }
  async function published(ctx:FacebookRequestContext,scheduleId:string){
    const post=await deps.getPost(ctx.workspaceId,scheduleId);
    if(!post || post.id!==scheduleId || post.workspaceId!==ctx.workspaceId || post.status!=='published' || post.postVariant.platform!=='facebook')throw new HttpError(404,'Published Facebook post not found.');
    if(!post.postVariant.socialAccountId)throw new HttpError(409,'The original Facebook Page is no longer connected.');
    const linked={...ctx,socialAccountId:post.postVariant.socialAccountId};
    const value=await account(linked),job=post.publishJobs.find(item=>item.status==='succeeded');
    if(!job?.providerPostId || (job.rawResponse && typeof job.rawResponse==='object' && 'simulated' in job.rawResponse && job.rawResponse.simulated===true))throw new HttpError(409,'Real Facebook post ID is unavailable.');
    return {value,postId:job.providerPostId,api:client(value)};
  }
  return {
    async getCapabilities(ctx:FacebookRequestContext){await authorize(ctx);return provider(()=>clientFromContext(ctx));},
    async listComments(ctx:FacebookRequestContext,scheduleId:string,after?:string){
      await authorize(ctx);const {api,postId,value}=await published(ctx,scheduleId);
      return provider(async()=>{await allowed(api,'readComments');const page=await api.listComments(postId,after);
        const local=await deps.listReceivedComments?.(value.id,postId,page.items.map(item=>item.id),!after)??[];
        const merged=new Map(page.items.map(item=>[item.id,item]));
        for(const item of local){if(item.deleted)merged.delete(item.id);else merged.set(item.id,item);}
        return {...page,items:[...merged.values()].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))};});
    },
    async replyToComment(ctx:FacebookRequestContext,scheduleId:string,commentId:string,text:string){
      await authorize(ctx,true);const {api,postId}=await published(ctx,scheduleId);
      return provider(async()=>{await allowed(api,'replyComments');const comment=await api.getComment(commentId);
        if(comment.postId!==postId || comment.id!==commentId)throw new HttpError(404,'Comment does not belong to this Facebook post.');
        return api.replyComment(commentId,text);});
    },
    async listConversations(ctx:FacebookRequestContext,after?:string){
      await authorize(ctx);const api=client(await account(ctx));
      return provider(async()=>{await allowed(api,'readMessages');const page=await api.listConversations(after);
        const local=!after && deps.listReceivedConversations?await deps.listReceivedConversations(ctx.socialAccountId):[];
        return {...page,items:[...page.items,...local.filter(item=>!page.items.some(remote=>remote.counterpartyId===item.counterpartyId))]};});
    },
    async listMessages(ctx:FacebookRequestContext,conversationId:string,after?:string){
      await authorize(ctx);const api=client(await account(ctx));
      return provider(async()=>{await allowed(api,'readMessages');if(conversationId.startsWith('local:')){
        await received(ctx,conversationId);if(!deps.listReceivedMessages)throw new HttpError(503,'Received messages are unavailable.');
        return deps.listReceivedMessages(ctx.socialAccountId,conversationId,after);
      }const conversation=await api.getConversation(conversationId),page=await api.listMessages(conversationId,after);
      const local=!after && deps.listReceivedConversations?(await deps.listReceivedConversations(ctx.socialAccountId)).find(item=>item.counterpartyId===conversation.counterpartyId):null;
      if(!local || !deps.listReceivedMessages)return page;
      const receivedPage=await deps.listReceivedMessages(ctx.socialAccountId,local.id);
      const merged=new Map(page.items.map(item=>[item.id,item]));
      for(const item of receivedPage.items)merged.set(item.id,{...item,conversationId});
      return {...page,items:[...merged.values()].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))};});
    },
    async replyToConversation(ctx:FacebookRequestContext,conversationId:string,text:string){
      await authorize(ctx,true);const value=await account(ctx),api=client(value);
      return provider(async()=>{
        await allowed(api,'replyMessages');await allowed(api,'readMessages');
        const local=conversationId.startsWith('local:');
        const conversation=local?await received(ctx,conversationId):await api.getConversation(conversationId);
        const messages=local?{items:[]}:await api.listMessages(conversationId);
        const now=deps.now();
        const times=messages.items.filter(message=>message.inbound && message.senderId===conversation.counterpartyId && message.recipientId===value.providerAccountId)
          .map(message=>new Date(message.timestamp)).filter(time=>Number.isFinite(time.getTime()) && time<=now);
        if(deps.latestInbound){const local=await deps.latestInbound(value.id,conversation.counterpartyId);if(local && local<=now)times.push(local);}
        const latest=times.sort((a,b)=>b.getTime()-a.getTime())[0]??null;
        if(!isFacebookMessagingWindowOpen(latest,now))throw new HttpError(409,'The verified 24-hour reply window is closed or unknown; use the official inbox.');
        return api.sendMessage(conversation.counterpartyId,text);
      });
    }
  };
  async function received(ctx:FacebookRequestContext,id:string){
    const value=await deps.getReceivedConversation?.(ctx.socialAccountId,id);
    if(!value)throw new HttpError(404,'Received conversation not found for this Page.');return value;
  }
  async function clientFromContext(ctx:FacebookRequestContext){
    const api=client(await account(ctx)),capabilities=await api.inspectCapabilities();
    if(capabilities.subscription.status==='available'){
      try{capabilities.subscription=await api.getSubscription();}
      catch{capabilities.subscription={status:'unknown',reason:'Page subscription could not be verified.'};}
    }
    return capabilities;
  }
}
