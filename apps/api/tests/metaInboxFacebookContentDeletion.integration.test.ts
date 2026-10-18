import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';import {createFacebookManagementReceptionStore} from '../src/facebookManagement/receptionStore';import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
import {createFacebookManagementRuntime} from '../src/facebookManagement/runtime';
const asset=(f:any)=>({workspaceId:f.workspaceIds[0],platform:'facebook' as const,appId:'123',providerAssetId:'100',connectionId:f.connections[0].id,connectionVersion:1});

test('verifiedFacebookCommentDeletionSurvivesBodyPurgeAndLateReplay',async()=>withFacebookManagementFixture(async f=>{
 const d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken}),store=createFacebookManagementReceptionStore({db:f.db,appId:'123',isDeleted:(tx:any,s:any)=>d.isDeleted(tx,s),onDeleted:(tx:any,s:any)=>d.markItemInTransaction(tx,s,s.eventKind,s.providerEventId)} as any);
 const time=await f.databaseNow(),event={pageId:'100',kind:'comment' as const,eventKey:'first-comment',providerId:'100_comment',postId:'100_post',senderId:'300',text:'Synthetic',occurredAt:time.toISOString()};
 async function drain(){const now=await f.databaseNow();for(const claim of await store.claimBatch(now,50)){await store.processClaim(claim,now);await store.finishClaim(claim.id,claim.claimToken);}}
 await store.enqueue([event]);await drain();await store.enqueue([{...event,eventKey:'delete-comment',deleted:true,text:undefined,occurredAt:new Date(time.getTime()+1).toISOString()}]);await drain();assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.workspaceIds[0]}}),1);
 await f.db.facebookInteractionComment.deleteMany({where:{managedPageId:f.pages[0].id}});await store.enqueue([{...event,eventKey:'late-replay',occurredAt:new Date(time.getTime()+2).toISOString()}]);await drain();assert.equal(await f.db.facebookInteractionComment.count({where:{managedPageId:f.pages[0].id}}),0);
}));

test('unselectedFacebookManagementPageDoesNotReceiveAnotherGrantsNotificationCopy',async()=>withFacebookManagementFixture(async f=>{
 const c=await f.db.facebookManagementConnection.create({data:{workspaceId:f.workspaceIds[0],userId:f.userId,appId:'123',providerUserId:'201',status:'active',userTokenEncrypted:'sealed:unselected',scopes:f.scopes}}),page=await f.db.facebookManagedPage.create({data:{connectionId:c.id,pageId:'100',name:'Unselected',active:true,notificationsEnabled:true,pageTokenEncrypted:'sealed:unselected',tasks:['MANAGE'],scopes:f.scopes}});
 const store=createFacebookManagementReceptionStore({db:f.db,appId:'123'});await store.enqueue([{pageId:'100',eventKey:'selected-only',providerId:'comment-selected',postId:'100_post',kind:'comment',text:'Synthetic',occurredAt:new Date().toISOString()}]);
 assert.equal(await f.db.facebookInteractionEvent.count({where:{managedPageId:page.id}}),0);assert.equal(await f.db.facebookInteractionEvent.count({where:{managedPageId:f.pages[0].id}}),1);
}));

test('facebookItemPurgeTargetsOnlyItsCommentAndReplyAuditNotAnotherThread',async()=>withFacebookManagementFixture(async f=>{
 const a=asset(f),d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken}),executor=createFacebookSendExecutor({db:f.db}),before=await f.snapshot();
 for(const id of ['remove','keep'])await f.db.facebookInteractionComment.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:id,postId:'100_post',senderId:'300',text:'Synthetic '+id,occurredAt:new Date()}});
 await f.db.facebookInteractionMessage.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:'remove',participantId:'300',senderId:'300',recipientId:'100',text:'Keep message with same ID',occurredAt:new Date()}});
 const keys=[randomUUID(),randomUUID()];for(const [i,targetId]of ['remove','keep'].entries())await executor.executeFacebookSend(f.contexts[0],{requestKey:keys[i],kind:'comment',targetId,text:'Synthetic reply'},async()=>({status:'sent',providerId:'reply-'+targetId}));
 const receipt=await d.markItem(a,'comments','remove');let done=false;for(let i=0;i<20&&!done;i++){const result=await d.purgeSources(receipt.confirmationCode,1);assert.ok(result.purged<=1);done=result.sourcesComplete;}assert.equal(done,true);
 assert.deepEqual((await f.db.facebookInteractionComment.findMany({where:{managedPageId:f.pages[0].id}})).map((r:any)=>r.providerId),['keep']);assert.ok(await f.db.facebookInteractionMessage.findUnique({where:{managedPageId_providerId:{managedPageId:f.pages[0].id,providerId:'remove'}}}));
 const rows=await f.db.facebookInteractionSendAttempt.findMany({where:{managedPageId:f.pages[0].id}});assert.equal(rows.find((r:any)=>r.requestKey===keys[0]).payloadHash,'deleted');assert.equal(rows.find((r:any)=>r.requestKey===keys[1]).status,'sent');assert.deepEqual(await f.snapshot(),before);
}));

test('defaultFacebookRuntimeConnectsVerifiedDeletionToTheDurableLifecycle',async()=>withFacebookManagementFixture(async f=>{
 const runtime=createFacebookManagementRuntime({db:f.db,settings:{enabled:true,appId:'123',graphVersion:'v25.0',loginConfigId:'999',callbackUrl:'https://example.test/api/v1/integrations/facebook-management/oauth/callback'},appSecret:'synthetic-facebook-secret',encrypt:encryptToken,decrypt:decryptToken,fetchImpl:async()=>{throw Error('No provider I/O allowed');}}),time=await f.databaseNow();
 await runtime.receptionStore.enqueue([{pageId:'100',kind:'comment',eventKey:'runtime-delete',providerId:'100_runtime_comment',postId:'100_post',senderId:'300',deleted:true,occurredAt:time.toISOString()}]);const now=await f.databaseNow();for(const claim of await runtime.receptionStore.claimBatch(now,50)){await runtime.receptionStore.processClaim(claim,now);await runtime.receptionStore.finishClaim(claim.id,claim.claimToken);}
 assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.workspaceIds[0],subjectKind:'item'}}),1);
}));
