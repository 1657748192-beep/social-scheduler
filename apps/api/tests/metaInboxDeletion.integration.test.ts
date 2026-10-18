import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
import {instagramReceptionFixture,syntheticInstagramEvent} from './helpers/instagramManagementReceptionFixture';
import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createHash,randomUUID} from 'node:crypto';
import {createInstagramSendExecutor} from '../src/instagramManagement/sendAttempts';
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
async function purgeAllSources(d:ReturnType<typeof service>,code:string){let done=false;for(let i=0;i<30&&!done;i++)done=(await d.purgeSources(code,2)).sourcesComplete;assert.equal(done,true);}
async function purgeAllDerived(d:ReturnType<typeof service>,code:string){let done=false;for(let i=0;i<100&&!done;i++){const result=await d.purgeDerived(code,2);assert.ok(result.purged<=2);assert.equal(result.blocked,null);done=result.complete;}assert.equal(done,true);}
test('deleteSingleCommentPreservesOtherThreadsAndCustomerNotes',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),other=await seedDeletionCustomer(f,'301'),before=await f.publishingSnapshot();
 const receipt=await d.markItem(asset(f),'comments',own.comment.providerId);await purgeAllSources(d,receipt.confirmationCode);await purgeAllDerived(d,receipt.confirmationCode);
 assert.equal(await d.status(receipt.confirmationCode),'completed');assert.equal(await f.db.interactionCase.findUnique({where:{id:own.cases[0].id}}),null);
 assert.ok(await f.db.interactionCase.findUnique({where:{id:own.cases[1].id}}));assert.ok(await f.db.customerNote.findUnique({where:{id:own.note.id}}));assert.ok(await f.db.interactionIdentity.findUnique({where:{id:own.identity.id}}));
 assert.ok(await f.db.interactionCustomerTag.findFirst({where:{customerId:own.customer.id}}));assert.ok(await f.db.interactionCase.findUnique({where:{id:other.cases[0].id}}));
 assert.equal(await f.db.readReceipt.count({where:{caseId:own.cases[0].id}}),0);assert.equal(await f.db.interactionCaseTag.count({where:{caseId:own.cases[0].id}}),0);assert.deepEqual(await f.publishingSnapshot(),before);
 assert.equal((await f.db.metaInboxDeletionRequest.findUniqueOrThrow({where:{confirmationCode:receipt.confirmationCode}})).targetEncrypted,null);
}));
test('deleteActorCleansNotesTagsAndIdentity',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),other=await seedDeletionCustomer(f,'301'),before=await f.publishingSnapshot();
 const receipt=await d.markActor(asset(f),'300');await purgeAllSources(d,receipt.confirmationCode);await purgeAllDerived(d,receipt.confirmationCode);
 assert.equal(await f.db.interactionCustomer.findUnique({where:{id:own.customer.id}}),null);assert.equal(await f.db.customerNote.count({where:{customerId:own.customer.id}}),0);assert.equal(await f.db.interactionCustomerTag.count({where:{customerId:own.customer.id}}),0);assert.equal(await f.db.interactionIdentity.findUnique({where:{id:own.identity.id}}),null);assert.equal(await f.db.interactionCase.count({where:{customerId:own.customer.id}}),0);
 assert.ok(await f.db.customerNote.findUnique({where:{id:other.note.id}}));assert.ok(await f.db.interactionIdentity.findUnique({where:{id:other.identity.id}}));assert.equal(await f.db.interactionCase.count({where:{customerId:other.customer.id}}),2);
 assert.equal(await f.db.interactionTag.count({where:{id:{in:[own.customerTag.id,own.caseTag.id]}}}),2);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('sharedCustomerNotesCannotBeDeletedByGuessingTheirAssetScope',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),fb=await f.seedVerifiedCase();
 await f.db.interactionIdentity.updateMany({where:{customerId:fb.customerId!},data:{customerId:own.customer.id}});await f.db.interactionCase.update({where:{id:fb.id},data:{customerId:own.customer.id}});
 const receipt=await d.markActor(asset(f),'300');await purgeAllSources(d,receipt.confirmationCode);let blocked:string|null=null;
 for(let i=0;i<50&&!blocked;i++)blocked=(await d.purgeDerived(receipt.confirmationCode,2)).blocked;
 assert.equal(blocked,'shared_customer_scope');assert.equal(await d.status(receipt.confirmationCode),'pending');assert.ok(await f.db.customerNote.findUnique({where:{id:own.note.id}}));assert.ok(await f.db.interactionCase.findUnique({where:{id:fb.id}}));
}));
test('actorPurgeScrubsSendMetadataButKeepsConsumedKeysAndOtherRecipients',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),a=asset(f);
 await f.db.instagramInteractionComment.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:1,providerId:'unprojected-comment',mediaId:'media-own',actorId:'300',text:'Synthetic source not indexed',occurredAt:new Date()}});
 const hashes=['["message","300"]','["comment","comment-300"]','["comment","unprojected-comment"]','["message","301"]'].map(v=>createHash('sha256').update(v).digest('hex'));
 const rows=[];for(const targetHash of hashes)rows.push(await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash,payloadHash:'private-payload-digest',status:'sent',providerId:'private-provider-id',diagnosticId:randomUUID()}}));
 const receipt=await d.markActor(a,'300');await purgeAllSources(d,receipt.confirmationCode);await purgeAllDerived(d,receipt.confirmationCode);
 for(const row of rows.slice(0,3)){const saved=await f.db.instagramInteractionSendAttempt.findUniqueOrThrow({where:{id:row.id}});assert.notEqual(saved.targetHash,row.targetHash);assert.notEqual(saved.payloadHash,row.payloadHash);assert.equal(saved.providerId,null);assert.equal(saved.status,'unknown');}
 assert.deepEqual(await f.db.instagramInteractionSendAttempt.findUniqueOrThrow({where:{id:rows[3].id}}),rows[3]);
 const resolved={ctx:f.adminCtx,accountId:f.instagramAccountIds[0],platform:'instagram' as const,canonicalKey:own.asset.canonicalKey,appNamespace:'456',providerAssetId:'100',connectionVersion:1,sourceRef:{platform:'instagram' as const,instagramAccountId:f.instagramAccountIds[0],connectionId:a.connectionId,connectionVersion:1}};let sends=0;
 await assert.rejects(createInstagramSendExecutor({db:f.db}).execute({asset:resolved,requestKey:rows[0].requestKey,kind:'message',targetId:'301',text:'Must not reuse deleted request'},async()=>{sends++;return{status:'sent',providerId:'bad'};}));assert.equal(sends,0);
}));
test('deletingOneMessageRebasesTheConversationInsteadOfDeletingRemainingMessages',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),a=asset(f),older=new Date(Date.now()-1000);
 await f.db.interactionItem.updateMany({where:{caseId:own.cases[1].id},data:{occurredAt:older}});
 const next=await f.db.instagramInteractionMessage.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:1,providerId:'remaining-message',conversationId:own.message.conversationId,actorId:'300',inbound:true,text:'Retained message',occurredAt:new Date()}});
 const source={platform:'instagram',instagramAccountId:f.instagramAccountIds[0],connectionId:a.connectionId,connectionVersion:1,sourceRecordId:next.id,conversationId:next.conversationId,participantId:'300'};
 await f.db.interactionItem.create({data:{workspaceId:a.workspaceId,assetId:own.asset.id,caseId:own.cases[1].id,platform:'instagram',providerEventId:next.providerId,direction:'inbound',occurredAt:next.occurredAt,sourceRef:source}});
 const receipt=await d.markItem(a,'messages',own.message.providerId);await purgeAllSources(d,receipt.confirmationCode);await purgeAllDerived(d,receipt.confirmationCode);
 const c=await f.db.interactionCase.findUniqueOrThrow({where:{id:own.cases[1].id}});assert.equal((c.sourceRef as any).sourceRecordId,next.id);assert.equal(c.lastInboundKey,'remaining-message');assert.equal(await f.db.interactionItem.count({where:{caseId:c.id}}),1);assert.ok(await f.db.customerNote.findUnique({where:{id:own.note.id}}));
 assert.ok(await f.db.interactionCaseTag.findFirst({where:{caseId:c.id}}));assert.ok(await f.db.instagramInteractionMessage.findUnique({where:{id:next.id}}));
}));
test('newerConversationScopeStaysPendingRatherThanErasingFreshCustomerState',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),a=asset(f),receipt=await d.markActor(a,'300');
 await f.db.instagramManagementConnection.update({where:{id:a.connectionId},data:{version:2}});await f.db.interactionAsset.update({where:{id:own.asset.id},data:{connectionVersion:2}});
 const next=await f.db.instagramInteractionMessage.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:2,providerId:'new-version-message',conversationId:own.message.conversationId,actorId:'300',inbound:true,text:'Fresh connection state',occurredAt:new Date()}});
 const source={platform:'instagram',instagramAccountId:f.instagramAccountIds[0],connectionId:a.connectionId,connectionVersion:2,sourceRecordId:next.id,conversationId:next.conversationId,participantId:'300'};
 await f.db.interactionItem.create({data:{workspaceId:a.workspaceId,assetId:own.asset.id,caseId:own.cases[1].id,platform:'instagram',providerEventId:next.providerId,direction:'inbound',occurredAt:next.occurredAt,sourceRef:source}});
 await f.db.interactionCase.update({where:{id:own.cases[1].id},data:{sourceRef:source}});await purgeAllSources(d,receipt.confirmationCode);let blocked:string|null=null;
 for(let i=0;i<50&&!blocked;i++)blocked=(await d.purgeDerived(receipt.confirmationCode,2)).blocked;
 assert.ok(blocked==='newer_scope_present'||blocked==='case_scope_changed');assert.equal(await d.status(receipt.confirmationCode),'pending');assert.ok(await f.db.instagramInteractionMessage.findUnique({where:{id:next.id}}));const saved=await f.db.interactionCase.findUniqueOrThrow({where:{id:own.cases[1].id}});assert.equal((saved.sourceRef as any).sourceRecordId,next.id);assert.equal((saved.sourceRef as any).connectionVersion,2);assert.ok(await f.db.customerNote.findUnique({where:{id:own.note.id}}));
}));
test('unmappedProcessedRawMetadataCannotReceiveACompletedDeletionReceipt',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),a=asset(f);
 await f.db.instagramInteractionEvent.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:1,eventKey:JSON.stringify(['messages','unknown-source',false,Date.now()]),payload:{processed:true},status:'processed'}});
 const receipt=await d.markActor(a,'300');await purgeAllSources(d,receipt.confirmationCode);let blocked:string|null=null;
 for(let i=0;i<100&&!blocked;i++)blocked=(await d.purgeDerived(receipt.confirmationCode,2)).blocked;
 assert.equal(blocked,'raw_scope_unavailable');assert.equal(await d.status(receipt.confirmationCode),'pending');assert.equal(await f.db.customerNote.findUnique({where:{id:own.note.id}}),null);
}));
test('unmappedGenericSendMetadataIsNotSilentlyPurgedOrReportedComplete',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),row=await f.db.interactionSendAttempt.create({data:{workspaceId:f.adminCtx.workspaceId,assetId:own.asset.id,requestKey:randomUUID(),targetHash:'unmapped-target',payloadHash:'unmapped-private-digest'}});
 const receipt=await d.markActor(asset(f),'300');await purgeAllSources(d,receipt.confirmationCode);let blocked:string|null=null;
 for(let i=0;i<100&&!blocked;i++)blocked=(await d.purgeDerived(receipt.confirmationCode,2)).blocked;
 assert.equal(blocked,'unmapped_send_scope');assert.equal(await d.status(receipt.confirmationCode),'pending');assert.deepEqual(await f.db.interactionSendAttempt.findUniqueOrThrow({where:{id:row.id}}),row);
}));
test('assetDisconnectPurgesDerivedFamiliesAndScrubsOnlyItsOldSendAudit',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),before=await f.publishingSnapshot();
 const row=await f.db.interactionSendAttempt.create({data:{workspaceId:f.adminCtx.workspaceId,assetId:own.asset.id,requestKey:randomUUID(),targetHash:'old-asset-target',payloadHash:'old-asset-payload',status:'sent',providerId:'old-provider'}});
 const receipt=await d.disconnect(asset(f));await purgeAllSources(d,receipt.confirmationCode);await purgeAllDerived(d,receipt.confirmationCode);
 const saved=await f.db.interactionSendAttempt.findUniqueOrThrow({where:{id:row.id}});assert.notEqual(saved.targetHash,row.targetHash);assert.notEqual(saved.payloadHash,row.payloadHash);assert.equal(saved.providerId,null);assert.equal(saved.status,'unknown');assert.equal((await f.db.interactionAsset.findUniqueOrThrow({where:{id:own.asset.id}})).active,false);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('missingMessageMappingCannotFalselyCompleteDeletionOfAnUnindexedConversation',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),before=await f.publishingSnapshot();
 await f.db.instagramInteractionMessage.delete({where:{id:own.message.id}});
 await f.db.interactionItem.deleteMany({where:{caseId:own.cases[1].id}});
 const receipt=await d.markItem(asset(f),'messages',own.message.providerId);await purgeAllSources(d,receipt.confirmationCode);
 const result=await d.purgeDerived(receipt.confirmationCode,2);
 assert.equal(result.complete,false);assert.equal(result.blocked,'item_scope_unavailable');assert.equal(await d.status(receipt.confirmationCode),'pending');
 assert.ok(await f.db.interactionCase.findUnique({where:{id:own.cases[1].id}}));assert.ok(await f.db.customerNote.findUnique({where:{id:own.note.id}}));assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('continuedPurgeCannotClearReceiptsAfterCaseMovesToANewerConnectionVersion',async()=>withMetaInboxFixture(async f=>{
 const d=service(f),own=await seedDeletionCustomer(f),a=asset(f),receipt=await d.markItem(a,'messages',own.message.providerId);await purgeAllSources(d,receipt.confirmationCode);
 const first=await d.purgeDerived(receipt.confirmationCode,1);assert.equal(first.purged,1);
 const ref={platform:'instagram',instagramAccountId:f.instagramAccountIds[0],connectionId:a.connectionId,connectionVersion:2,sourceRecordId:randomUUID(),conversationId:own.message.conversationId,participantId:'300'};
 await f.db.interactionCase.update({where:{id:own.cases[1].id},data:{sourceRef:ref}});
 const result=await d.purgeDerived(receipt.confirmationCode,1);
 assert.equal(result.complete,false);assert.equal(result.blocked,'case_scope_changed');assert.equal(await d.status(receipt.confirmationCode),'pending');
 assert.equal(await f.db.readReceipt.count({where:{caseId:own.cases[1].id}}),1);assert.equal(await f.db.interactionCaseTag.count({where:{caseId:own.cases[1].id}}),1);
}));
