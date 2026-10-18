import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {createInstagramManagementRuntime} from '../src/instagramManagement/runtime';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
const config={enabled:true,appId:'456',appSecret:'synthetic-independent-secret',graphVersion:'v25.0',callbackUrl:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',requiredScopes:['instagram_business_basic','instagram_business_manage_messages']};

test('independentDisconnectAndCleanupAdmissionCommitTogether',async()=>withMetaInboxFixture(async f=>{
 const d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken}),before=await f.publishingSnapshot();
 const runtime=createInstagramManagementRuntime({db:f.db,config,policy:createLiveInboxPolicy([]),encrypt:encryptToken,decrypt:decryptToken,onDisconnect:(tx,c)=>(d as any).recordDisconnectInTransaction(tx,{workspaceId:c.workspaceId,platform:'instagram',appId:c.appId,providerAssetId:c.providerAccountId,connectionId:c.id,connectionVersion:c.version})});
 assert.deepEqual(await runtime.disconnect(f.adminCtx,f.instagramConnectionIds[0]),{disconnected:true});
 const c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});assert.equal(c.version,2);assert.equal(c.tokenEncrypted,null);
 const jobs=await f.db.metaInboxDeletionRequest.findMany({where:{workspaceId:f.adminCtx.workspaceId}});assert.equal(jobs.length,1);assert.equal(jobs[0].reason,'connection_disconnected');assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('failedDisconnectAdmissionDoesNotLeaveAnUntrackedRevocation',async()=>withMetaInboxFixture(async f=>{
 const d=createMetaInboxDeletion({db:f.db,encrypt:()=>{throw Error('synthetic encryption failure');},decrypt:decryptToken});
 const runtime=createInstagramManagementRuntime({db:f.db,config,policy:createLiveInboxPolicy([]),encrypt:encryptToken,decrypt:decryptToken,onDisconnect:(tx,c)=>(d as any).recordDisconnectInTransaction(tx,{workspaceId:c.workspaceId,platform:'instagram',appId:c.appId,providerAssetId:c.providerAccountId,connectionId:c.id,connectionVersion:c.version})});
 const before=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});await assert.rejects(runtime.disconnect(f.adminCtx,before.id));assert.deepEqual(await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:before.id}}),before);
 assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);assert.equal(await f.db.metaInboxDeletionMarker.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));
