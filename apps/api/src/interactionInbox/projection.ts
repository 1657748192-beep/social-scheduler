import type {PrismaClient} from '@prisma/client';import {HttpError} from '../utils/errors';
import type {InboxAccess} from './access';import {parseInboxSource} from './source';
import type {AdapterPage,ResolvedAsset,Scope,Capability} from './types';
import {inboxSourceAlive} from './sourceLifetime';
import {createLiveInboxPolicy,type LiveInboxPolicy} from './livePolicy';
export function createInboxProjection({db,access,policy=createLiveInboxPolicy([])}:{db:PrismaClient;access:InboxAccess;policy?:LiveInboxPolicy}){
 return{async projectVerifiedPage(ctx:Scope,a:ResolvedAsset,page:AdapterPage){
  if(a.platform!=='facebook'&&a.platform!=='instagram')throw new HttpError(409,'Platform not integrated');
  const platform=a.platform;
  const evidence=policy.requireAsset({workspaceId:ctx.workspaceId,platform:a.platform,appId:a.appNamespace,providerAssetId:a.providerAssetId},'read');
  const originalSource=parseInboxSource(a.sourceRef,a.platform);
  if(page.items.length>1250)throw new HttpError(502,'Provider result too large');
  const fresh=await access.resolveInboxAsset(ctx,a.accountId);if(fresh.canonicalKey!==a.canonicalKey||fresh.connectionVersion!==a.connectionVersion)throw new HttpError(409,'Connection changed');
  const required=[...new Set(page.items.map(item=>`${item.kind}.read` as Capability))];
  for(const capability of required)await access.resolveInboxAsset(ctx,a.accountId,capability);
  return access.write(ctx,async tx=>{
   await access.assertCurrent(tx,{...a,ctx});
   for(const capability of required)await access.assertCurrent(tx,{...a,ctx},capability);
   const linkage=originalSource.platform==='facebook'?{facebookManagedPageId:originalSource.managedPageId,instagramConnectionId:null}:{instagramConnectionId:originalSource.connectionId,facebookManagedPageId:null};
   const asset=await tx.interactionAsset.upsert({where:{workspaceId_canonicalKey:{workspaceId:ctx.workspaceId,canonicalKey:a.canonicalKey}},create:{workspaceId:ctx.workspaceId,canonicalKey:a.canonicalKey,platform:a.platform,appNamespace:a.appNamespace,providerAssetId:a.providerAssetId,...linkage,connectionVersion:a.connectionVersion},update:{active:true,...linkage,connectionVersion:a.connectionVersion}});
   let count=0;
   for(const v of page.items){
    const ref=parseInboxSource(v.sourceRef,platform),time=new Date(v.occurredAt);
    if(!v.providerEventId||v.providerEventId.length>512||!Number.isFinite(time.getTime())||time.getTime()>Date.now()+300000||ref.platform!==originalSource.platform||ref.platform==='facebook'&&originalSource.platform==='facebook'&&ref.managedPageId!==originalSource.managedPageId||ref.platform==='instagram'&&originalSource.platform==='instagram'&&ref.instagramAccountId!==originalSource.instagramAccountId||ref.connectionId!==originalSource.connectionId||ref.connectionVersion!==a.connectionVersion)throw new HttpError(502,'Inconsistent provider identity');
    if(time.getTime()<Date.now()-evidence.contentRetentionDays*86400000)continue;
    if(ref.platform==='facebook'&&!ref.sourceRecordId){const where={managedPageId_providerId:{managedPageId:ref.managedPageId,providerId:v.providerEventId}},original=v.kind==='messages'?await tx.facebookInteractionMessage.findUnique({where,select:{id:true}}):await tx.facebookInteractionComment.findUnique({where,select:{id:true}});if(original)ref.sourceRecordId=original.id;}
    if(!await inboxSourceAlive(tx,ref,time,new Date(),policy))continue;
    let identity=v.actorId?await tx.interactionIdentity.findUnique({where:{workspaceId_platform_appNamespace_assetId_providerActorId:{workspaceId:ctx.workspaceId,platform:a.platform,appNamespace:a.appNamespace,assetId:asset.id,providerActorId:v.actorId}}}):null;
    if(v.actorId&&!identity){const customer=await tx.interactionCustomer.create({data:{workspaceId:ctx.workspaceId}});identity=await tx.interactionIdentity.create({data:{workspaceId:ctx.workspaceId,assetId:asset.id,customerId:customer.id,platform:a.platform,appNamespace:a.appNamespace,providerActorId:v.actorId,displayName:v.actorName,firstSeenAt:time,lastSeenAt:time}});}
    const key={workspaceId:ctx.workspaceId,assetId:asset.id,kind:v.kind,providerThreadOrEventId:v.threadId};
    const c=await tx.interactionCase.upsert({where:{workspaceId_assetId_kind_providerThreadOrEventId:key},create:{...key,customerId:identity?.customerId,sourceRef:ref},update:{sourceRef:ref}});
    const existing=await tx.interactionItem.findUnique({where:{workspaceId_assetId_providerEventId:{workspaceId:ctx.workspaceId,assetId:asset.id,providerEventId:v.providerEventId}}});
    if(existing){if(v.deleted)await tx.interactionItem.update({where:{id:existing.id},data:{deleted:true}});continue;}
    await tx.interactionItem.create({data:{workspaceId:ctx.workspaceId,assetId:asset.id,caseId:c.id,platform:a.platform,providerEventId:v.providerEventId,direction:v.inbound?'inbound':'outbound',occurredAt:time,sourceRef:ref,text:null,deleted:v.deleted}});count++;
    if(v.inbound&&!v.deleted&&(!c.lastInboundAt||time>=c.lastInboundAt))await tx.interactionCase.update({where:{id:c.id},data:{lastInboundAt:time,lastInboundKey:v.providerEventId,status:'pending',version:{increment:1}}});
   }
   return{revision:count,count};
  });
 }};
}
