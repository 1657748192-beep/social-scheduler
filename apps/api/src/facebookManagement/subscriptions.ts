import type {PrismaClient} from '@prisma/client';
import type {PageContext} from './types';
import type {createFacebookPageAccess} from './access';
import {requireManagementMember,activeManagementOwner} from './access';
import {HttpError} from '../utils/errors';
type Access=Awaited<ReturnType<ReturnType<typeof createFacebookPageAccess>['resolvePageAccess']>>;
type Client={getSubscribedFields():Promise<string[]>;subscribe(fields:string[]):Promise<boolean>};
export function createFacebookSubscriptionService(deps:{db:PrismaClient;appId:string;resolvePageAccess:ReturnType<typeof createFacebookPageAccess>['resolvePageAccess'];createClient:(access:Access)=>Client}){
  const includes=(fields:string[])=>['feed','messages'].every(f=>fields.includes(f));
  function allowed(access:Access){
    if(access.appId!==deps.appId||!['owner','admin'].includes(access.role)||!['MANAGE','MESSAGING','MODERATE'].every(t=>access.tasks.includes(t))||!['pages_show_list','pages_manage_metadata','pages_messaging','pages_read_engagement','pages_read_user_content'].every(s=>access.scopes.includes(s)))throw new HttpError(403,'Required Page notification permissions or tasks are missing');
  }
  return {
    async status(ctx:PageContext){
      const access=await deps.resolvePageAccess(ctx,{requirePublishingBinding:true});
      const page=await deps.db.facebookManagedPage.findUnique({where:{id:access.managedPageId},select:{notificationsEnabled:true}});
      const event=await deps.db.facebookInteractionEvent.findFirst({where:{managedPageId:access.managedPageId,status:'done'},orderBy:{receivedAt:'desc'},select:{receivedAt:true}});
      let subscription:'available'|'missing'|'unknown'='unknown';
      try{subscription=includes(await deps.createClient(access).getSubscribedFields())?'available':'missing';}catch{/* Actual provider status is unknown, never inferred from a grant. */}
      return{enabled:page?.notificationsEnabled??false,subscription,lastReceivedAt:event?.receivedAt.toISOString()??null,source:'signed_webhook' as const};
    },
    async enableNotifications(ctx:PageContext){
      await requireManagementMember(deps.db,ctx,false,true);
      const access=await deps.resolvePageAccess(ctx,{write:true,requirePublishingBinding:true});allowed(access);
      try{return await deps.db.$transaction(async tx=>{
        // A shared app/Page resource must serialize GET + additive POST across
        // API instances and workspaces. No unsubscribe is ever issued here.
        await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${deps.appId+':'+access.pageId},0))`;
        await requireManagementMember(tx,ctx,false,true);
        const client=deps.createClient(access),existing=await client.getSubscribedFields();
        if(!Array.isArray(existing)||existing.some(f=>! /^[a-z_]{1,100}$/.test(f)))throw new HttpError(502,'Facebook subscription fields unavailable');
        const fields=[...new Set([...existing,'feed','messages'])].sort();
        if(!includes(existing)&&await client.subscribe(fields)!==true)throw new HttpError(502,'Facebook subscription outcome unavailable');
        const selected=await tx.facebookManagementPageSelection.findUnique({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:access.pageId}}});
        const bound=await tx.socialAccount.findFirst({where:{id:access.publishingAccountId!,workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:access.pageId,accountType:'page',status:'active'},select:{id:true}});
        if(selected?.managedPageId!==access.managedPageId||!bound)throw new HttpError(409,'Page selection changed; check before enabling notifications');
        await requireManagementMember(tx,ctx,false,true);
        const changed=await tx.facebookManagedPage.updateMany({where:{id:access.managedPageId,active:true,connection:{id:access.connectionId,appId:deps.appId,workspaceId:ctx.workspaceId,status:'active',version:access.connectionVersion,user:activeManagementOwner(ctx.workspaceId)}},data:{notificationsEnabled:true}});
        if(changed.count!==1)throw new HttpError(409,'Management authorization changed; check notification status');
        await tx.facebookManagementSubscription.upsert({where:{appId_pageId:{appId:deps.appId,pageId:access.pageId}},create:{appId:deps.appId,pageId:access.pageId,fields,status:'configured',checkedAt:new Date()},update:{fields,status:'configured',checkedAt:new Date(),diagnosticId:null}});
        return{enabled:true,subscription:'available' as const};
      },{timeout:30000});}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(502,'Facebook notification configuration could not be confirmed');}
    }
  };
}
