import test from 'node:test';import assert from 'node:assert/strict';
import {withInboxFixture} from './helpers/interactionInboxFixture';
import {createInboxAccess} from '../src/interactionInbox/access';
test('fourDisabledPlatformsNeverCallNetworkOrPublishingCredentials',async()=>{
 const m=await import('../src/interactionInbox/adapters/disabled').catch(()=>null);assert.ok(m,'disabled adapter required');
 for(const platform of ['instagram','youtube','tiktok','pinterest']){
  const adapter=m.createDisabledAdapter(),asset:any={platform};
  assert.ok((await adapter.capabilities(asset)).every((c:any)=>!c.available&&c.reason==='not_integrated'));
  await assert.rejects(adapter.list(asset,'messages',null,25));await assert.rejects(adapter.reply(asset,{},'text','key'));
 }
});
test('facebookProjectionContainsReferencesNotCopiedBodies',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/adapters/facebook').catch(()=>null),p=await import('../src/interactionInbox/projection').catch(()=>null);assert.ok(m&&p,'Facebook adapter and projection required');
 const caps:any={readComments:{status:'available'},readMessages:{status:'available'},replyMessages:{status:'available'},replyComments:{status:'available'}};
 const access=createInboxAccess({db:f.db,facebookEnabled:true,verifyFacebook:async()=>caps}),asset=await access.resolveInboxAsset(f.adminCtx,f.accountIds[0],'messages.read');
 const engagement:any={capabilities:async()=>caps,conversations:async(ctx:any)=>{assert.equal(ctx.managedPageId,f.pages[0].id);return{items:[{id:'thread-300',counterpartyId:'300',counterpartyName:'Same name',updatedAt:'2026-10-01T12:00:00Z'}],nextCursor:null};},messages:async()=>({items:[{id:'m1',conversationId:'thread-300',senderId:'300',recipientId:'100',text:'source-only secret',timestamp:'2026-10-01T12:00:00Z',inbound:true}],nextCursor:null})};
 const adapter=m.createFacebookInboxAdapter({db:f.db,engagement}),page=await adapter.list(asset,'messages',null,25);assert.equal(page.items.length,1);
 const projection=p.createInboxProjection({db:f.db,access,policyVerified:true});await projection.projectVerifiedPage(f.adminCtx,asset,page);await projection.projectVerifiedPage(f.adminCtx,asset,page);
 const row=await f.db.interactionItem.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId}});assert.equal(row.text,null);assert.equal(await f.db.interactionItem.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);
 const c=await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId}});assert.ok(c.customerId);assert.equal((await adapter.detail(asset,c.sourceRef as any)).items[0].text,'source-only secret');
 assert.equal(await f.db.interactionCase.count({where:{workspaceId:f.foreignCtx.workspaceId}}),0);
}));
