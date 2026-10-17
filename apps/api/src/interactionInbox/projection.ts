import type {PrismaClient} from '@prisma/client';import {HttpError} from '../utils/errors';
import type {InboxAccess} from './access';import {sourceSchema} from './access';
import type {AdapterPage,ResolvedAsset,Scope} from './types';
export function createInboxProjection({db,access}:{db:PrismaClient;access:InboxAccess}){
 return{async projectVerifiedPage(ctx:Scope,a:ResolvedAsset,page:AdapterPage){
  if(page.items.length>1250)throw new HttpError(502,'Provider result too large');
  const fresh=await access.resolveInboxAsset(ctx,a.accountId);if(fresh.canonicalKey!==a.canonicalKey||fresh.connectionVersion!==a.connectionVersion)throw new HttpError(409,'Connection changed');
  return access.write(ctx,async tx=>{
   const connection=await tx.facebookManagementConnection.findFirst({where:{id:a.sourceRef?.connectionId,workspaceId:ctx.workspaceId,status:'active',version:a.connectionVersion}});
   const selection=await tx.facebookManagementPageSelection.findUnique({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:a.providerAssetId}}});
   if(!connection||selection?.managedPageId!==a.sourceRef?.managedPageId)throw new HttpError(404,'Connection changed');
   const asset=await tx.interactionAsset.upsert({where:{workspaceId_canonicalKey:{workspaceId:ctx.workspaceId,canonicalKey:a.canonicalKey}},create:{workspaceId:ctx.workspaceId,canonicalKey:a.canonicalKey,platform:a.platform,appNamespace:a.appNamespace,providerAssetId:a.providerAssetId,facebookManagedPageId:a.sourceRef!.managedPageId,connectionVersion:a.connectionVersion},update:{active:true,facebookManagedPageId:a.sourceRef!.managedPageId,connectionVersion:a.connectionVersion}});
   let count=0;
   for(const v of page.items){
    const ref=sourceSchema.parse(v.sourceRef),time=new Date(v.occurredAt);
    if(!v.providerEventId||v.providerEventId.length>512||!Number.isFinite(time.getTime())||time.getTime()>Date.now()+300000||ref.managedPageId!==a.sourceRef?.managedPageId||ref.connectionId!==a.sourceRef?.connectionId||ref.connectionVersion!==a.connectionVersion)throw new HttpError(502,'Inconsistent provider identity');
    let identity=v.actorId?await tx.interactionIdentity.findUnique({where:{workspaceId_platform_appNamespace_assetId_providerActorId:{workspaceId:ctx.workspaceId,platform:a.platform,appNamespace:a.appNamespace,assetId:asset.id,providerActorId:v.actorId}}}):null;
    if(v.actorId&&!identity){const customer=await tx.interactionCustomer.create({data:{workspaceId:ctx.workspaceId}});identity=await tx.interactionIdentity.create({data:{workspaceId:ctx.workspaceId,assetId:asset.id,customerId:customer.id,platform:a.platform,appNamespace:a.appNamespace,providerActorId:v.actorId,displayName:v.actorName,firstSeenAt:time,lastSeenAt:time}});}
    const key={workspaceId:ctx.workspaceId,assetId:asset.id,kind:v.kind,providerThreadOrEventId:v.threadId};
    const c=await tx.interactionCase.upsert({where:{workspaceId_assetId_kind_providerThreadOrEventId:key},create:{...key,customerId:identity?.customerId,sourceRef:ref},update:{sourceRef:ref}});
    const existing=await tx.interactionItem.findUnique({where:{workspaceId_assetId_providerEventId:{workspaceId:ctx.workspaceId,assetId:asset.id,providerEventId:v.providerEventId}}});
    if(existing){if(v.deleted)await tx.interactionItem.update({where:{id:existing.id},data:{deleted:true}});continue;}
    await tx.interactionItem.create({data:{workspaceId:ctx.workspaceId,assetId:asset.id,caseId:c.id,platform:a.platform,providerEventId:v.providerEventId,direction:v.inbound?'inbound':'outbound',occurredAt:time,sourceRef:ref,text:a.platform==='facebook'?null:v.text,deleted:v.deleted}});count++;
    if(v.inbound&&!v.deleted&&(!c.lastInboundAt||time>=c.lastInboundAt))await tx.interactionCase.update({where:{id:c.id},data:{lastInboundAt:time,lastInboundKey:v.providerEventId,status:'pending',version:{increment:1}}});
   }
   return{revision:count,count};
  });
 }};
}
