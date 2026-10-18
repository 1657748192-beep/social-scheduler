import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createInboxRetention} from '../src/interactionInbox/retention';import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';

test('ordinaryRetentionDoesNotDeleteLiveIndependentInstagramCases',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),before=await f.publishingSnapshot();await createInboxRetention({db:f.db}).pruneInbox(new Date(),50);
 assert.equal(await f.db.interactionCase.count({where:{id:{in:own.cases.map(v=>v.id)}}}),2);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('expiredCaseCleanupPreservesMinimumLineageUntilCoveredNotesArePurged',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken}),receipt=await d.disconnect({workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1});
 let sources=false;for(let i=0;i<10&&!sources;i++)sources=(await d.purgeSources(receipt.confirmationCode,50)).sourcesComplete;assert.equal(sources,true);
 for(let i=0;i<5;i++)await createInboxRetention({db:f.db}).pruneInbox(new Date(),50);const lineage=await f.db.interactionIdentity.findUnique({where:{id:own.identity.id}});assert.ok(lineage);assert.equal(lineage.displayName,null);assert.ok(await f.db.customerNote.findUnique({where:{id:own.note.id}}));
 let done=false;for(let i=0;i<20&&!done;i++){const result=await d.purgeDerived(receipt.confirmationCode,2);assert.equal(result.blocked,null);done=result.complete;}assert.equal(done,true);assert.equal(await f.db.interactionCustomer.findUnique({where:{id:own.customer.id}}),null);
}));

test('allDerivedExpirationStagesShareOneMutationBudgetWithoutCascadeOvershoot',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),workspaceId=f.adminCtx.workspaceId,old=new Date(Date.now()-91*86400000),prune=createInboxRetention({db:f.db});
 await f.db.instagramInteractionMessage.update({where:{id:own.message.id},data:{receivedAt:old,occurredAt:old}});await f.db.instagramInteractionComment.update({where:{id:own.comment.id},data:{receivedAt:old,occurredAt:old}});await f.db.interactionItem.updateMany({where:{workspaceId},data:{receivedAt:old,occurredAt:old}});
 const count=async()=>{const values=await Promise.all([f.db.interactionCase.count({where:{workspaceId}}),f.db.interactionItem.count({where:{workspaceId}}),f.db.readReceipt.count({where:{workspaceId}}),f.db.interactionCaseTag.count({where:{workspaceId}}),f.db.interactionIdentity.count({where:{workspaceId}})]);return values.reduce((sum,v)=>sum+v,0);};
 for(let i=0;i<20;i++){const before=await count(),removed=await prune.pruneInbox(new Date(),1),after=await count();assert.ok(before-after<=1,'a one-entity tick must not cascade through the whole conversation');assert.ok(removed<=1);}
 assert.equal(await f.db.interactionCase.count({where:{workspaceId}}),0);assert.ok(await f.db.customerNote.findUnique({where:{id:own.note.id}}));
}));

test('expirationRebasesADeletedSourceInsteadOfErasingOtherLiveMessages',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),workspaceId=f.adminCtx.workspaceId,now=new Date(),base=own.cases[1].sourceRef as any;
 const message=await f.db.instagramInteractionMessage.create({data:{workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,providerId:'still-live',conversationId:own.message.conversationId,actorId:'300',inbound:true,text:'Synthetic still live',occurredAt:now}}),ref={...base,sourceRecordId:message.id};
 const item=await f.db.interactionItem.create({data:{workspaceId,assetId:own.asset.id,caseId:own.cases[1].id,platform:'instagram',providerEventId:message.providerId,direction:'inbound',sourceRef:ref,occurredAt:now}});
 await f.db.instagramInteractionMessage.update({where:{id:own.message.id},data:{deleted:true,text:null}});await createInboxRetention({db:f.db}).pruneInbox(now,50);
 assert.ok(await f.db.interactionItem.findUnique({where:{id:item.id}}));const c=await f.db.interactionCase.findUniqueOrThrow({where:{id:own.cases[1].id}});assert.equal((c.sourceRef as any).sourceRecordId,message.id);
}));
