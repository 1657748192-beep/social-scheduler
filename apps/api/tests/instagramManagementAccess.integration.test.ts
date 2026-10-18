import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {createInstagramManagementAccess} from '../src/instagramManagement/access';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
const scopes=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
test('independentAccessDoesNotExposeTokenOrReadPublishingCredential',async()=>withMetaInboxFixture(async f=>{
 const policy=createLiveInboxPolicy([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}}]);
 const access=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async(_id,token)=>{assert.equal(token,'sealed:independent');return{appId:'456',providerAccountId:'100',scopes,expiresAt:new Date(Date.now()+86400000)};}}),before=await f.publishingSnapshot();
 const asset=await access.resolve(f.adminCtx,f.instagramAccountIds[0],'comments.read');assert.equal(asset.platform,'instagram');assert.equal(asset.sourceRef?.connectionId,f.instagramConnectionIds[0]);assert.doesNotMatch(JSON.stringify(asset),/sealed|tokenEncrypted|accessToken/);
 await assert.rejects(access.resolve(f.adminCtx,f.instagramAccountIds[0],'messages.reply'));
 await assert.rejects(access.resolve(f.foreignCtx,f.instagramAccountIds[0],'comments.read'));
 await assert.rejects(access.resolve(f.viewerCtx,f.instagramAccountIds[0],'comments.read'));
 await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{status:'disconnected',tokenEncrypted:null,version:{increment:1}}});await assert.rejects(access.resolve(f.adminCtx,f.instagramAccountIds[0],'comments.read'));
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('missingPolicyAndMissingIndependentGrantNeverFallbackToPublishing',async()=>withMetaInboxFixture(async f=>{
 let calls=0;const access=createInstagramManagementAccess({db:f.db,appId:'456',policy:createLiveInboxPolicy([]),decrypt:()=>{calls++;throw Error('must not decrypt');},inspect:async()=>{calls++;throw Error('must not fetch');}});
 await assert.rejects(access.resolve(f.adminCtx,f.instagramAccountIds[0],'messages.read'));assert.equal(calls,0);
 assert.equal((await f.db.oauthCredential.findUniqueOrThrow({where:{socialAccountId:f.instagramAccountIds[0]}})).accessTokenEncrypted,'publishing-original-do-not-touch');
}));
test('authorizerDemotedDuringInspectionCannotReturnCredentials',async()=>withMetaInboxFixture(async f=>{
 const policy=createLiveInboxPolicy([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}}]);
 const access=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async()=>{
  await f.db.workspaceMember.update({where:{workspaceId_userId:{workspaceId:f.adminCtx.workspaceId,userId:f.userId}},data:{role:'viewer'}});
  return{appId:'456',providerAccountId:'100',scopes,expiresAt:new Date(Date.now()+86400000)};
 }});
 await assert.rejects(access.resolve(f.adminCtx,f.instagramAccountIds[0],'messages.read'));
}));
test('scopesRevokedDuringInspectionCannotReturnCredentials',async()=>withMetaInboxFixture(async f=>{
 const policy=createLiveInboxPolicy([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}}]);
 const access=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async()=>{
  await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{scopes:['instagram_business_basic']}});return{appId:'456',providerAccountId:'100',scopes,expiresAt:new Date(Date.now()+86400000)};
 }});await assert.rejects(access.resolve(f.adminCtx,f.instagramAccountIds[0],'messages.read'));
}));
