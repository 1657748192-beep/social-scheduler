import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {withInboxFixture} from './helpers/interactionInboxFixture';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';

test('migrationPreservesPublishingSnapshot',async()=>withInboxFixture(async f=>{
 const post=await f.db.post.create({data:{workspaceId:f.adminCtx.workspaceId,authorId:f.userId,baseText:'Original protected',variants:{create:{platform:'facebook',socialAccountId:f.accountIds[0],text:'Original protected'}}},include:{variants:true}});
 const schedule=await f.db.schedule.create({data:{workspaceId:f.adminCtx.workspaceId,postVariantId:post.variants[0].id,createdBy:f.userId,scheduledAt:new Date(Date.now()+86400000)}});
 await f.db.publishJob.create({data:{workspaceId:f.adminCtx.workspaceId,scheduleId:schedule.id,postVariantId:post.variants[0].id,idempotencyKey:randomUUID()}});
 const before=await f.protectedSnapshot(),url=process.env.FACEBOOK_TEST_DATABASE_URL!;
 require('../../../scripts/local-upload-test-environment.cjs').validateTestDatabaseUrl(url,process.env.DATABASE_URL);
 const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema','apps/api/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:url},encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,'Isolated migration failed; output withheld to prevent connection disclosure');
 assert.deepEqual(await f.protectedSnapshot(),before);
}));
test('crossWorkspaceForeignKeysRejected',async()=>withMetaInboxFixture(async f=>{
 const db=f.db as any,before=await f.publishingSnapshot();
 const valid=await db.interactionAsset.create({data:{workspaceId:f.adminCtx.workspaceId,platform:'instagram',canonicalKey:'valid',appNamespace:'456',providerAssetId:'100',instagramConnectionId:f.instagramConnectionIds[0],connectionVersion:1}});
 assert.equal(valid.instagramConnectionId,f.instagramConnectionIds[0]);
 await assert.rejects(db.instagramInteractionMessage.create({data:{workspaceId:f.foreignCtx.workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,providerId:'msg-1',conversationId:'thread-1',actorId:'300',inbound:true,occurredAt:new Date(),text:'synthetic'}}));
 await assert.rejects(db.interactionAsset.create({data:{workspaceId:f.foreignCtx.workspaceId,platform:'instagram',canonicalKey:'foreign',appNamespace:'456',providerAssetId:'100',instagramConnectionId:f.instagramConnectionIds[0],connectionVersion:1}}));
 await assert.rejects(db.interactionAsset.create({data:{workspaceId:f.adminCtx.workspaceId,platform:'instagram',canonicalKey:'wrong-app',appNamespace:'999',providerAssetId:'100',instagramConnectionId:f.instagramConnectionIds[0],connectionVersion:1}}));
 await assert.rejects(db.instagramManagementConnection.create({data:{workspaceId:f.foreignCtx.workspaceId,platform:'facebook',appId:'999',providerAccountId:'100',providerUserId:'200',userId:f.userId,scopes:[]}}));
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('connectionAppAssetNamespaceUnique',async()=>withMetaInboxFixture(async f=>{
 const db=f.db as any,before=await f.publishingSnapshot(),data={workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAccountId:'100',providerUserId:'200',userId:f.userId,scopes:[]};
 await assert.rejects(db.instagramManagementConnection.create({data}));
 const other=await db.instagramManagementConnection.create({data:{...data,appId:'457'}});
 assert.notEqual(other.id,f.instagramConnectionIds[0]);
 await assert.rejects(db.instagramManagementConnection.update({where:{id:other.id},data:{version:0}}));
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('sameProviderEventDifferentAppIsDistinct',async()=>withMetaInboxFixture(async f=>{
 const db=f.db as any,workspaceId=f.adminCtx.workspaceId,before=await f.publishingSnapshot();
 const other=await db.instagramManagementConnection.create({data:{workspaceId,platform:'instagram',appId:'457',providerAccountId:'100',providerUserId:'200',userId:f.userId,scopes:[]}});
 const event={workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,eventKey:'same-event',payload:{synthetic:true}};
 await db.instagramInteractionEvent.create({data:event});await assert.rejects(db.instagramInteractionEvent.create({data:event}));
 await db.instagramInteractionEvent.create({data:{...event,connectionId:other.id}});
 assert.equal(await db.instagramInteractionEvent.count({where:{workspaceId,eventKey:'same-event'}}),2);
 await f.db.facebookInteractionMessage.create({data:{managedPageId:f.pages[0].id,providerId:'same-id',participantId:'300',senderId:'300',recipientId:'100',text:'synthetic FB',occurredAt:new Date()}});
 for(const connectionId of [f.instagramConnectionIds[0],other.id])await db.instagramInteractionMessage.create({data:{workspaceId,connectionId,connectionVersion:1,providerId:'same-id',conversationId:'thread-1',actorId:'300',inbound:true,occurredAt:new Date(),text:'synthetic IG'}});
 assert.equal(await db.instagramInteractionMessage.count({where:{workspaceId,providerId:'same-id'}}),2);
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('deletionLocatorIsDurableWithoutPlaintextSubjectInAudit',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot();
 const row=await (f.db.metaInboxDeletionRequest as any).create({data:{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',subjectKind:'item',subjectHash:'synthetic-hash',reason:'verified_content_deletion',confirmationCode:randomUUID(),targetEncrypted:'sealed:synthetic-locator',requestKey:randomUUID()}});
 const saved=await (f.db.metaInboxDeletionRequest as any).findUniqueOrThrow({where:{id:row.id}});assert.equal(saved.targetEncrypted,'sealed:synthetic-locator');assert.equal(saved.attempts,0);assert.ok(saved.nextAttemptAt instanceof Date);assert.deepEqual(await f.publishingSnapshot(),before);
}));
