import type { CapabilityState } from '../integrations/social/facebookEngagementTypes';
export type FacebookSubscriptionContext={pageId:string;accessToken:string;otherBindings:number;ownedFields:string[];
  saveOwnedFields(fields:string[]):Promise<void>;savePendingRelease():Promise<void>;clearPendingRelease():Promise<void>};
type Client={inspectCapabilities():Promise<{subscription:CapabilityState}>;getSubscribedFields():Promise<string[]>;subscribe(fields:string[]):Promise<boolean>;unsubscribe():Promise<boolean>};
export function createFacebookSubscriptionService(deps:{withAccount<T>(accountId:string,run:(ctx:FacebookSubscriptionContext)=>Promise<T>):Promise<T>;createClient(pageId:string,accessToken:string):Client}){
  return {
    ensure:(accountId:string):Promise<CapabilityState>=>deps.withAccount(accountId,async ctx=>{
      const api=deps.createClient(ctx.pageId,ctx.accessToken);
      try{
        const state=(await api.inspectCapabilities()).subscription;if(state.status!=='available')return state;
        const existing=await api.getSubscribedFields();
        const owned=[...new Set([...ctx.ownedFields,...['feed','messages'].filter(field=>!existing.includes(field))])];
        await ctx.saveOwnedFields(owned);
        await api.subscribe([...new Set([...existing,'feed','messages'])]);
        const verified=await api.getSubscribedFields();
        return ['feed','messages'].every(field=>verified.includes(field))?{status:'available'}:{status:'unknown',reason:'Page subscription could not be confirmed.'};
      }catch{return {status:'unknown',reason:'Page subscription failed; publishing authorization is unchanged.'};}
    }),
    release:(accountId:string):Promise<void>=>deps.withAccount(accountId,async ctx=>{
      if(ctx.otherBindings>0 || !ctx.ownedFields.length)return;
      await ctx.savePendingRelease();
      try{
        const api=deps.createClient(ctx.pageId,ctx.accessToken),existing=await api.getSubscribedFields();
        const remaining=existing.filter(field=>!ctx.ownedFields.includes(field));
        if(remaining.length)await api.subscribe(remaining);else await api.unsubscribe();
        await ctx.clearPendingRelease();
      }catch{/* Keep durable pending release for a bounded retry; local unbinding may proceed. */}
    })
  };
}
