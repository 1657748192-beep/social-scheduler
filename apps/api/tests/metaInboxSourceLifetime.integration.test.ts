import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {inboxSourceAlive} from '../src/interactionInbox/sourceLifetime';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';

test('instagramLifetimeRequiresExactIndependentAccountEpochAndExistingSource',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),now=new Date(),source=own.cases[0].sourceRef as any;
 assert.equal(await inboxSourceAlive(f.db,source,now,now),true);
 assert.equal(await inboxSourceAlive(f.db,{...source,instagramAccountId:f.instagramAccountIds[1]},now,now),false);
 assert.equal(await inboxSourceAlive(f.db,{...source,connectionVersion:2},now,now),false);
 assert.equal(await inboxSourceAlive(f.db,{...source,sourceRecordId:undefined},now,now),false);
 await f.db.instagramInteractionComment.update({where:{id:own.comment.id},data:{deleted:true}});assert.equal(await inboxSourceAlive(f.db,source,now,now),false);
}));

test('instagramLifetimeHonorsShorterPolicyAtExactOccurrenceBoundary',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),now=new Date(),cutoff=new Date(now.getTime()-86400000),source=own.cases[0].sourceRef as any;
 const policy=createLiveInboxPolicy([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:false,sendEnabled:false,policy:{product:'synthetic-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:1,contentRetentionDays:1,replyWindowMs:1000,reviewed:true}}]);
 for(const [delta,want]of [[-1,false],[0,true],[1,true]] as const){await f.db.instagramInteractionComment.update({where:{id:own.comment.id},data:{occurredAt:new Date(cutoff.getTime()+delta),receivedAt:now}});assert.equal(await inboxSourceAlive(f.db,source,now,now,policy),want);}
}));

test('instagramCachedBodyBecomesUnreadableImmediatelyAfterItemDeletion',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),source=own.cases[0].sourceRef as any,now=new Date(),before=await f.publishingSnapshot();
 assert.equal(await inboxSourceAlive(f.db,source,now,now),true);
 const d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken});await d.markItem({workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1},'comments',own.comment.providerId);
 assert.equal(await inboxSourceAlive(f.db,source,now,now),false);assert.ok(await f.db.instagramInteractionComment.findUnique({where:{id:own.comment.id}}),'body has not yet been asynchronously purged');assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('facebookCachedSourceCannotOutliveItsIndependentGrant',async()=>withFacebookManagementFixture(async f=>{
 const now=new Date(),row=await f.db.facebookInteractionMessage.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:'synthetic-message',participantId:'300',senderId:'300',recipientId:'100',text:'Synthetic body',occurredAt:now}});
 const source={platform:'facebook' as const,connectionId:f.connections[0].id,connectionVersion:1,managedPageId:f.pages[0].id,conversationId:'thread-300',participantId:'300',sourceRecordId:row.id};
 assert.equal(await inboxSourceAlive(f.db,source,now,now),true);
 await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{status:'disconnected',version:2}});assert.equal(await inboxSourceAlive(f.db,source,now,now),false);
}));

test('facebookLegacySourceWithUnknownEpochIsNotRelabelledAsCurrent',async()=>withFacebookManagementFixture(async f=>{
 const now=new Date(),row=await f.db.facebookInteractionComment.create({data:{managedPageId:f.pages[0].id,providerId:'synthetic-comment',postId:'100_1',text:'Unknown epoch',occurredAt:now}});
 const source={platform:'facebook' as const,connectionId:f.connections[0].id,connectionVersion:1,managedPageId:f.pages[0].id,commentId:row.providerId,sourceRecordId:row.id};
 assert.equal(await inboxSourceAlive(f.db,source,now,now),false);
}));
