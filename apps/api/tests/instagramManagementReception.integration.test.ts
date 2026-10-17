import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {instagramReceptionFixture,syntheticInstagramEvent} from './helpers/instagramManagementReceptionFixture';
const later=()=>new Date(Date.now()+200);
test('wrongAppRecipientHasNoWrites',async()=>withMetaInboxFixture(async f=>{
 const wrong=await instagramReceptionFixture(f,{appId:'999'});await wrong.enqueue([syntheticInstagramEvent()]);assert.equal(await f.db.instagramInteractionEvent.count({where:{workspaceId:{in:f.workspaceIds}}}),0);
 const store=await instagramReceptionFixture(f);await store.enqueue([syntheticInstagramEvent({recipientId:'999'})]);assert.equal(await f.db.instagramInteractionEvent.count({where:{workspaceId:{in:f.workspaceIds}}}),0);
}));
test('duplicateDeliveryExactlyOnce',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f),event=syntheticInstagramEvent(),before=await f.publishingSnapshot();
 await store.enqueue([event,event]);assert.equal(await f.db.instagramInteractionEvent.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);
 const [claim]=await store.claimBatch(later(),50);assert.ok(claim);await store.processClaim(claim,later());await store.finishClaim(claim.id,claim.claimToken);await store.enqueue([event]);
 assert.equal(await f.db.instagramInteractionMessage.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);assert.equal((await store.claimBatch(later(),50)).length,0);
 const raw=await f.db.instagramInteractionEvent.findUniqueOrThrow({where:{id:claim.id}});assert.doesNotMatch(JSON.stringify(raw.payload),/Synthetic incoming|senderId|300/);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('sameAssetAcrossWorkspacesNotBroadcast',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f,{bothWorkspaces:true});await store.enqueue([syntheticInstagramEvent()]);assert.equal(await f.db.instagramInteractionEvent.count({where:{workspaceId:{in:f.workspaceIds}}}),0);
}));
test('policyOffStoresNothing',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f,{disabled:true});await store.enqueue([syntheticInstagramEvent()]);assert.equal(await f.db.instagramInteractionEvent.count({where:{workspaceId:{in:f.workspaceIds}}}),0);
}));
test('disconnectDuringLeaseDoesNotRecreateData',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f);await store.enqueue([syntheticInstagramEvent()]);const [claim]=await store.claimBatch(later(),50);
 await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{status:'disconnected',version:{increment:1},tokenEncrypted:null}});
 await store.processClaim(claim,later());await store.finishClaim(claim.id,claim.claimToken);assert.equal(await f.db.instagramInteractionMessage.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));
test('oldDeletedEventCannotResurrect',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f),base=Date.now();
 for(const event of [syntheticInstagramEvent({timestamp:base}),syntheticInstagramEvent({timestamp:base+1,deleted:true}),syntheticInstagramEvent({timestamp:base+2,text:'Old duplicate'})]){
  await store.enqueue([event]);const [claim]=await store.claimBatch(later(),50);assert.ok(claim);await store.processClaim(claim,later());await store.finishClaim(claim.id,claim.claimToken);
 }
 const message=await f.db.instagramInteractionMessage.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId}});assert.equal(message.deleted,true);assert.equal(message.text,null);
}));
test('deletionGuardSuppressesBothEnqueueAndClaimProcessing',async()=>withMetaInboxFixture(async f=>{
 let removed=false;const store=await instagramReceptionFixture(f,{isDeleted:async()=>removed});await store.enqueue([syntheticInstagramEvent()]);const [claim]=await store.claimBatch(later(),50);removed=true;
 await store.processClaim(claim,later());await store.finishClaim(claim.id,claim.claimToken);await store.enqueue([syntheticInstagramEvent({eventId:'mid-2'})]);
 assert.equal(await f.db.instagramInteractionMessage.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);assert.equal(await f.db.instagramInteractionEvent.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);
}));
test('leaseRecoveryFencesOldTokenAndClaimLimit',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f);await store.enqueue([syntheticInstagramEvent()]);await assert.rejects(store.claimBatch(later(),51));
 const firstTime=later(),[first]=await store.claimBatch(firstTime,50),secondTime=new Date(firstTime.getTime()+31000),[second]=await store.claimBatch(secondTime,50);assert.notEqual(first.claimToken,second.claimToken);
 await store.processClaim(first,secondTime);assert.equal(await f.db.instagramInteractionMessage.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
 await store.processClaim(second,secondTime);await store.finishClaim(second.id,second.claimToken);assert.equal(await f.db.instagramInteractionMessage.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);
}));
test('missingAndFutureTimesNeverCreateFreshInboundTime',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f);await store.enqueue([syntheticInstagramEvent({timestamp:0}),syntheticInstagramEvent({eventId:'mid-2',timestamp:Date.now()+86400000})]);
 for(const claim of await store.claimBatch(later(),50)){await store.processClaim(claim,later());await store.finishClaim(claim.id,claim.claimToken);}
 const messages=await f.db.instagramInteractionMessage.findMany({where:{workspaceId:f.adminCtx.workspaceId}});assert.equal(messages.length,2);assert.ok(messages.every(m=>m.occurredAt.getTime()===0));
}));
test('foreignAppCannotFinishOrFailOtherStoreClaim',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f),foreign=await instagramReceptionFixture(f,{appId:'999'});await store.enqueue([syntheticInstagramEvent()]);const [claim]=await store.claimBatch(later(),50);
 const before=await f.db.instagramInteractionEvent.findUniqueOrThrow({where:{id:claim.id}});await foreign.finishClaim(claim.id,claim.claimToken);await foreign.failClaim(claim.id,claim.claimToken);
 assert.deepEqual(await f.db.instagramInteractionEvent.findUniqueOrThrow({where:{id:claim.id}}),before);
}));
test('expiredRawCannotBecomeFreshSource',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f);await store.enqueue([syntheticInstagramEvent()]);await f.db.instagramInteractionEvent.updateMany({where:{workspaceId:f.adminCtx.workspaceId},data:{receivedAt:new Date(Date.now()-8*86400000)}});
 assert.equal((await store.claimBatch(later(),50)).length,0);assert.equal(await store.prune(later()),1);assert.equal(await f.db.instagramInteractionMessage.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));
