import test from 'node:test';import assert from 'node:assert/strict';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {createFacebookManagementReceptionStore} from '../src/facebookManagement/receptionStore';
import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';
import {randomUUID} from 'node:crypto';

test('queuedFacebookEventCannotCrossAnIndependentAuthorizationRenewal',async()=>withFacebookManagementFixture(async f=>{
 const store=createFacebookManagementReceptionStore({db:f.db,appId:'123'}),before=await f.snapshot(),now=await f.databaseNow();
 await store.enqueue([{pageId:'100',eventKey:'old-epoch',kind:'message',providerId:'old-message',senderId:'300',recipientId:'100',text:'Synthetic old epoch',occurredAt:now.toISOString()}]);
 await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{version:{increment:1}}});
 const time=await f.databaseNow();for(const claim of await store.claimBatch(time,50)){await store.processClaim(claim,time);await store.finishClaim(claim.id,claim.claimToken);}
 assert.equal(await f.db.facebookInteractionMessage.count({where:{managedPageId:f.pages[0].id}}),0);
 assert.equal(await f.db.facebookInteractionMessage.count({where:{managedPageId:f.pages[1].id}}),1);assert.deepEqual(await f.snapshot(),before);
}));

test('newFacebookSourceCarriesTheVerifiedConnectionEpoch',async()=>withFacebookManagementFixture(async f=>{
 const store=createFacebookManagementReceptionStore({db:f.db,appId:'123'}),now=await f.databaseNow();
 await store.enqueue([{pageId:'100',eventKey:'current-epoch',kind:'comment',providerId:'comment-1',postId:'100_1',senderId:'300',text:'Synthetic comment',occurredAt:now.toISOString()}]);
 const time=await f.databaseNow();for(const claim of await store.claimBatch(time,50)){await store.processClaim(claim,time);await store.finishClaim(claim.id,claim.claimToken);}
 const rows=await f.db.facebookInteractionComment.findMany({where:{managedPageId:{in:f.pages.map((v:any)=>v.id)}}});assert.equal(rows.length,2);assert.ok(rows.every((v:any)=>v.connectionVersion===1));
}));

test('facebookSendAttemptPinsEpochWithoutStoringMessageBody',async()=>withFacebookManagementFixture(async f=>{
 const before=await f.snapshot(),requestKey=randomUUID(),executor=createFacebookSendExecutor({db:f.db});
 assert.deepEqual(await executor.executeFacebookSend(f.contexts[0],{requestKey,kind:'message',targetId:'300',text:'Synthetic private body'},async()=>({status:'sent',providerId:'sent-synthetic'})),{status:'sent',providerId:'sent-synthetic'});
 const row=await f.db.facebookInteractionSendAttempt.findUniqueOrThrow({where:{managedPageId_requestKey:{managedPageId:f.pages[0].id,requestKey}}});assert.equal(row.connectionVersion,1);assert.doesNotMatch(JSON.stringify(row),/Synthetic private body/);assert.deepEqual(await f.snapshot(),before);
}));
