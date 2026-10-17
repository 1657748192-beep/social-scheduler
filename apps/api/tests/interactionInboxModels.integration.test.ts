import test from 'node:test';
import assert from 'node:assert/strict';
test('modelIsolationAndSourceOnlyFacebook',async()=>{
 const m=await import('./helpers/interactionInboxFixture').catch(()=>null);assert.ok(m,'isolated inbox fixture and models required');
 await m.withInboxFixture(async f=>{
  const before=await f.protectedSnapshot(),a=await f.seedVerifiedCase(),b=await f.seedVerifiedCase(1);
  await assert.rejects(f.db.interactionCustomerTag.create({data:{workspaceId:f.adminCtx.workspaceId,customerId:a.customerId!,tagId:(await f.db.interactionTag.create({data:{workspaceId:f.foreignCtx.workspaceId,kind:'customer',name:'foreign',normalizedName:'foreign',color:'green'}})).id}}));
  await assert.rejects(f.db.interactionItem.create({data:{workspaceId:f.adminCtx.workspaceId,assetId:a.assetId,caseId:a.id,platform:'facebook',providerEventId:'bad-body',direction:'inbound',occurredAt:new Date(),sourceRef:{},text:'must-not-copy'}}));
  await assert.rejects(f.db.interactionItem.create({data:{workspaceId:f.adminCtx.workspaceId,assetId:a.assetId,caseId:b.id,platform:'facebook',providerEventId:'wrong-case',direction:'inbound',occurredAt:new Date(),sourceRef:{}}}));
  const asset=await f.db.interactionAsset.findUniqueOrThrow({where:{id:a.assetId}});
  await assert.rejects(f.db.interactionAsset.create({data:{workspaceId:asset.workspaceId,canonicalKey:asset.canonicalKey,platform:'facebook',appNamespace:'123',providerAssetId:'100',facebookManagedPageId:f.pages[0].id,connectionVersion:1}}));
  await assert.rejects(f.db.interactionAsset.update({where:{id:asset.id},data:{connectionId:'00000000-0000-4000-8000-000000000001'}}));
  await assert.rejects(f.db.interactionItem.create({data:{workspaceId:asset.workspaceId,assetId:asset.id,caseId:a.id,platform:'instagram',providerEventId:'spoof-platform',direction:'inbound',occurredAt:new Date(),sourceRef:{},text:'bypass-reference-check'}}));
  await assert.rejects(f.db.interactionIdentity.create({data:{workspaceId:asset.workspaceId,assetId:asset.id,customerId:a.customerId!,platform:'facebook',appNamespace:'wrong-app',providerActorId:'spoof-app'}}));
  assert.deepEqual(await f.protectedSnapshot(),before);
 });
});
