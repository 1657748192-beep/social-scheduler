import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {instagramReceptionFixture,syntheticInstagramEvent} from './helpers/instagramManagementReceptionFixture';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';

test('verifiedInstagramContentDeletionDurablyBlocksReplayAfterSourceBodyIsGone',async()=>withMetaInboxFixture(async f=>{
 const d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken});
 const store=await instagramReceptionFixture(f,{isDeleted:(tx:any,s:any)=>d.isDeleted(tx,s),onDeleted:(tx:any,s:any)=>(d as any).markItemInTransaction(tx,s,s.eventKind,s.providerEventId)});
 async function drain(){const now=new Date(Date.now()+100);for(const claim of await store.claimBatch(now,50)){await store.processClaim(claim,now);await store.finishClaim(claim.id,claim.claimToken);}}
 const event=syntheticInstagramEvent();await store.enqueue([event]);await drain();const before=await f.publishingSnapshot();
 await store.enqueue([{...event,deleted:true}]);await drain();assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.adminCtx.workspaceId,subjectKind:'item'}}),1);
 await f.db.instagramInteractionMessage.deleteMany({where:{connectionId:f.instagramConnectionIds[0]}});
 await store.enqueue([{...event,timestamp:Date.now()+1,text:'Must not reimport'}]);await drain();assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId:f.instagramConnectionIds[0]}}),0);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('failedDeletionAdmissionRollsBackTheReceivedBodyMutation',async()=>withMetaInboxFixture(async f=>{
 const store=await instagramReceptionFixture(f,{onDeleted:async()=>{throw Error('synthetic transaction failure');}}),event=syntheticInstagramEvent();
 await store.enqueue([event]);let time=new Date(Date.now()+100);for(const claim of await store.claimBatch(time,50)){await store.processClaim(claim,time);await store.finishClaim(claim.id,claim.claimToken);}
 const before=await f.db.instagramInteractionMessage.findFirstOrThrow({where:{connectionId:f.instagramConnectionIds[0]}});
 await store.enqueue([{...event,deleted:true}]);time=new Date(Date.now()+100);const claims=await store.claimBatch(time,50);assert.equal(claims.length,1);
 await assert.rejects(store.processClaim(claims[0],time));assert.deepEqual(await f.db.instagramInteractionMessage.findUniqueOrThrow({where:{id:before.id}}),before);
}));
