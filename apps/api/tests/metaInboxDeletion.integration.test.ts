import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
import {instagramReceptionFixture,syntheticInstagramEvent} from './helpers/instagramManagementReceptionFixture';
const service=(f:MetaInboxFixture)=>createMetaInboxDeletion({db:f.db,hmacKey:'synthetic-deletion-hmac-key-only',encrypt:encryptToken,decrypt:decryptToken});
const asset=(f:MetaInboxFixture,patch:Record<string,unknown>={})=>({workspaceId:f.adminCtx.workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1,...patch});
const subject=(f:MetaInboxFixture,patch:Record<string,unknown>={})=>({...asset(f),actorId:'300',providerEventId:'same-event',eventKind:'comments' as const,occurredAt:new Date(),...patch});
test('deleteSameIdOnlyMatchingApp',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),before=await f.publishingSnapshot();await d.markItem(asset(f),'comments','same-event');
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,subject(f))),true);
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,subject(f,{appId:'999'}))),false);
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,subject(f,{platform:'facebook'}))),false);
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,subject(f,{eventKind:'messages'}))),false);
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,subject(f,{workspaceId:f.foreignCtx.workspaceId}))),false);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('deleteMarkerAndEncryptedPurgeRequestCommitTogetherAndReplayDoesNotMultiplyJobs',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),first=await d.markActor(asset(f),'sensitive-actor');const again=await d.markActor(asset(f),'sensitive-actor');assert.equal(first.confirmationCode,again.confirmationCode);
 const rows=await f.db.metaInboxDeletionRequest.findMany({where:{workspaceId:f.adminCtx.workspaceId}});assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.ok(rows[0].targetEncrypted);assert.doesNotMatch(JSON.stringify(rows),/sensitive-actor/);
 assert.equal(await d.status(first.confirmationCode),'pending');assert.equal(await d.status('x'.repeat(43)),null);
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,subject(f,{actorId:'sensitive-actor'}))),true);
}));
test('disconnectImmediatelyBlocksCachedReadsWithoutChangingPublishingCredential',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),before=await f.publishingSnapshot(),at=new Date();await d.disconnect(asset(f));
 const c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});assert.equal(c.status,'disconnected');assert.equal(c.tokenEncrypted,null);assert.equal(c.version,2);
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,subject(f,{occurredAt:at}))),true);
 assert.equal(await f.db.$transaction(tx=>d.isDeleted(tx,subject(f,{connectionVersion:2,occurredAt:new Date(at.getTime()-1000)}))),true);
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('foreignScopeAndEncryptionFailureCannotLeavePartialMarkers',async()=>withMetaInboxFixture(async f=>{
 const d=service(f);await assert.rejects(d.markItem(asset(f,{appId:'999'}),'comments','event'));assert.equal(await f.db.metaInboxDeletionMarker.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
 const broken=createMetaInboxDeletion({db:f.db,hmacKey:'synthetic-deletion-hmac-key-only',encrypt:()=>{throw Error('private failure');},decrypt:decryptToken});await assert.rejects(broken.markActor(asset(f),'300'));
 assert.equal(await f.db.metaInboxDeletionMarker.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));
test('boundedSourcePurgePreservesOtherActorsAndNewConnectionVersions',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),a=asset(f),before=await f.publishingSnapshot();
 for(const [id,actorId,version]of [['remove','300',1],['keep-other','301',1],['keep-new','300',2]] as const)await f.db.instagramInteractionMessage.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:version,providerId:id,conversationId:'thread-'+actorId,actorId,inbound:true,text:id,occurredAt:new Date()}});
 const receipt=await d.markActor(a,'300');let complete=false;
 for(let i=0;i<8&&!complete;i++){const result=await d.purgeSources(receipt.confirmationCode,1);assert.ok(result.purged<=1);complete=result.sourcesComplete;}
 assert.equal(complete,true);assert.deepEqual((await f.db.instagramInteractionMessage.findMany({where:{connectionId:a.connectionId},orderBy:{providerId:'asc'}})).map(v=>v.providerId),['keep-new','keep-other']);
 assert.equal(await d.status(receipt.confirmationCode),'pending','source purge is not a completed derived-data deletion');assert.deepEqual(await f.publishingSnapshot(),before);
 await assert.rejects(d.purgeSources(receipt.confirmationCode,51));
}));
test('delayedReadCannotUndoDelete',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),a=asset(f),receiver=await instagramReceptionFixture(f,{isDeleted:(tx:any,s:any)=>d.isDeleted(tx,s)}),event=syntheticInstagramEvent({eventId:'late-replay'});
 await receiver.enqueue([event]);const [claim]=await receiver.claimBatch(new Date(Date.now()+100),1);await receiver.processClaim(claim,new Date());await receiver.finishClaim(claim.id,claim.claimToken);
 const receipt=await d.markItem(a,'messages','late-replay');let complete=false;for(let i=0;i<8&&!complete;i++)complete=(await d.purgeSources(receipt.confirmationCode,50)).sourcesComplete;assert.equal(complete,true);
 assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId:a.connectionId,providerId:'late-replay'}}),0);
 await receiver.enqueue([event]);assert.equal(await f.db.instagramInteractionEvent.count({where:{connectionId:a.connectionId}}),0);assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId:a.connectionId,providerId:'late-replay'}}),0);
}));
test('commentDeletionCannotBlockDifferentMessageWithSameProviderId',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),receiver=await instagramReceptionFixture(f,{isDeleted:(tx:any,s:any)=>d.isDeleted(tx,s)});await d.markItem(asset(f),'comments','same-id');
 await receiver.enqueue([syntheticInstagramEvent({eventId:'same-id'})]);assert.equal(await f.db.instagramInteractionEvent.count({where:{connectionId:f.instagramConnectionIds[0]}}),1);
}));
