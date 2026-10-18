import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';import {createInboxAccess} from '../src/interactionInbox/access';import {createInboxProjection} from '../src/interactionInbox/projection';import {createInboxReads} from '../src/interactionInbox/reads';import {createInboxSends} from '../src/interactionInbox/sends';
import {createInstagramManagementAccess} from '../src/instagramManagement/access';import {createInstagramManagementEngagement} from '../src/instagramManagement/engagement';import {createInstagramInboxAdapter} from '../src/interactionInbox/adapters/instagram';import {createFacebookInboxAdapter} from '../src/interactionInbox/adapters/facebook';import {createInboxRegistry} from '../src/interactionInbox/adapters/registry';
import {createInteractionInboxRuntime} from '../src/interactionInbox/runtime';import {createInboxReception} from '../src/interactionInbox/reception';import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';import {pendingInboxSend} from '../src/interactionInbox/sends';import {createInboxDirectory} from '../src/interactionInbox/directory';
import {createInstagramManagementRuntime} from '../src/instagramManagement/runtime';
async function setup(f:any){
 const rules=f.workspaceIds.flatMap((workspaceId:string)=>['facebook','instagram'].map(platform=>({workspaceId,platform,appId:platform==='facebook'?'123':'456',providerAssetId:'100',readEnabled:true,sendEnabled:true,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}})));
 const policy=createLiveInboxPolicy(rules as any),scopes=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
 const instagramAccess=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes,expiresAt:new Date(Date.now()+86400000)})});
 let sends=0;const engagement=createInstagramManagementEngagement({db:f.db,access:instagramAccess,policy,graph:()=>({sendMessage:async()=>{sends++;return{status:'unknown',diagnosticId:randomUUID()};}} as any),isDeleted:async()=>false,verifiedCommentLimit:1000});
 const access=createInboxAccess({db:f.db,facebookEnabled:true,policy,instagram:{enabled:true,access:instagramAccess},verifyFacebook:async()=>({readComments:{status:'available'},readMessages:{status:'available'},replyComments:{status:'available'},replyMessages:{status:'available'}})} as any);
 const fb=createFacebookInboxAdapter({db:f.db,engagement:{} as any}),ig=createInstagramInboxAdapter({db:f.db,access:instagramAccess,policy,engagement}),registry=createInboxRegistry(fb,ig);
 return{access,policy,registry,instagram:{enabled:true,access:instagramAccess,engagement},projection:createInboxProjection({db:f.db,access,policy}),reads:createInboxReads({db:f.db,access,registry,policy,redis:{eval:async()=>1} as any}),sends:createInboxSends({db:f.db,access,registry}),providerSends:()=>sends};
}

test('facebookAndInstagramSameCustomerNameRemainDistinct',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),before=await f.publishingSnapshot(),fb=await f.seedVerifiedCase(),own=await seedDeletionCustomer(f);
 await f.db.interactionIdentity.updateMany({where:{customerId:{in:[fb.customerId!,own.customer.id]}},data:{displayName:'Same visitor'}});
 const asset=await s.access.resolveInboxAsset(f.adminCtx,f.instagramAccountIds[0],'messages.read');assert.equal(asset.platform,'instagram');
 const result=await s.reads.listCases(f.adminCtx,{accountIds:[f.accountIds[0],f.instagramAccountIds[0]],kind:'messages'});assert.deepEqual(new Set(result.items.map(v=>v.id)),new Set([fb.id,own.cases[1].id]));assert.ok(result.items.every(v=>v.customerName==='Same visitor'));assert.notEqual(fb.customerId,own.customer.id);
 const detail=await s.reads.getCase(f.adminCtx,own.cases[1].id,{accountIds:[f.instagramAccountIds[0]],kind:'messages'});assert.equal(detail.items[0].text,'Synthetic message');assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('igUnknownBlocksSecondKey',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),own=await seedDeletionCustomer(f),c=own.cases[1],input={targetId:own.message.conversationId,text:'Synthetic reply',requestKey:randomUUID()},before=await f.publishingSnapshot();
 assert.equal((await s.sends.replyToCase(f.adminCtx,c.id,input)).status,'unknown');assert.equal((await s.sends.replyToCase(f.adminCtx,c.id,input)).status,'unknown');assert.equal(s.providerSends(),1);
 const detail=await s.reads.getCase(f.adminCtx,c.id,{accountIds:[f.instagramAccountIds[0]],kind:'messages'});assert.equal(detail.pendingSend?.status,'unknown');
 await assert.rejects(s.sends.replyToCase(f.adminCtx,c.id,{...input,requestKey:randomUUID()}),(e:any)=>e.statusCode===409);assert.equal(s.providerSends(),1);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('instagramProjectionPersistsReferencesWithoutDuplicatingPrivateBodies',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),own=await seedDeletionCustomer(f),asset=await s.access.resolveInboxAsset(f.adminCtx,f.instagramAccountIds[0],'messages.read'),items=await s.registry.getInboxAdapter('instagram').normalizeVerifiedEvent([own.message.id],asset);
 const result=await s.projection.projectVerifiedPage(f.adminCtx,asset,{items,nextCursor:null,coverage:'synthetic',warnings:[]});assert.equal(result.count,0);assert.equal(await f.db.interactionItem.count({where:{assetId:own.asset.id,text:{not:null}}}),0);
}));

test('reauthInvalidatesOldDetailAndContinuation',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),own=await seedDeletionCustomer(f);await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{version:{increment:1}}});
 await assert.rejects(s.reads.getCase(f.adminCtx,own.cases[1].id,{accountIds:[f.instagramAccountIds[0]],kind:'messages'}));
 const result=await s.reads.listCases(f.adminCtx,{accountIds:[f.instagramAccountIds[0]],kind:'messages'});assert.deepEqual(result.items,[]);assert.equal(result.accountsStatus[0].status,'not_synced');
}));

test('fbUnknownUsesExistingAttemptStore',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),c=await f.seedVerifiedCase(),asset=await s.access.resolveInboxAsset(f.adminCtx,f.accountIds[0],'messages.read'),key=randomUUID(),executor=createFacebookSendExecutor({db:f.db});let calls=0;
 await executor.executeFacebookSend({...f.adminCtx,managedPageId:f.pages[0].id},{requestKey:key,targetId:'300',kind:'message',text:'Synthetic'},async()=>{calls++;throw Error('lost acknowledgement');});
 await f.db.interactionAudit.create({data:{workspaceId:c.workspaceId,actorId:f.userId,targetId:c.id,action:'reply.reference',result:key}});
 const pending=await pendingInboxSend(f.db,f.adminCtx,c.id,c.sourceRef as any,asset,s.registry);assert.equal(pending?.status,'unknown');assert.equal(calls,1);assert.equal(await f.db.facebookInteractionSendAttempt.count({where:{managedPageId:f.pages[0].id,requestKey:key}}),1);assert.equal(await f.db.interactionSendAttempt.count({where:{requestKey:key}}),0);
}));

test('runtimeActuallyRegistersTheIndependentInstagramAdapterButDefaultsClosed',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),own=await seedDeletionCustomer(f),facebook={enabled:true,engagement:{capabilities:async()=>({readComments:{status:'available'},readMessages:{status:'available'}})}} as any;
 const runtime=createInteractionInboxRuntime({db:f.db,redis:{} as any,facebook,instagram:s.instagram,policy:s.policy} as any);
 const detail=await runtime.reads.getCase(f.adminCtx,own.cases[1].id,{accountIds:[f.instagramAccountIds[0]],kind:'messages'});assert.equal(detail.items[0].text,'Synthetic message');
 const disabled=createInteractionInboxRuntime({db:f.db,redis:{} as any,facebook,policy:s.policy} as any);await assert.rejects(disabled.access.resolveInboxAsset(f.adminCtx,f.instagramAccountIds[0]));
}));

test('onePlatformFailureReturnsPartialAndViewerCannotRefreshOrReply',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),own=await seedDeletionCustomer(f),redis={eval:async()=>1,zrem:async()=>1,get:async()=>null,set:async()=> 'OK'} as any;
 const page={items:[],nextCursor:null,coverage:'synthetic',warnings:[]};const registry={getInboxAdapter:(p:string)=>p==='facebook'?{list:async()=>page}:{list:async()=>{throw Error('provider unavailable');}}} as any;
 const reception=createInboxReception({db:f.db,access:s.access,registry,projection:s.projection,redis}),result=await reception.refreshInbox(f.adminCtx,{accountIds:[f.accountIds[0],f.instagramAccountIds[0]],kind:'messages'});
 assert.equal(result.partial,true);assert.equal(result.results.find(v=>v.accountId===f.accountIds[0])?.status,'ok');assert.equal(result.results.find(v=>v.accountId===f.instagramAccountIds[0])?.status,'unavailable');
 await assert.rejects(reception.refreshInbox(f.viewerCtx,{accountIds:[f.instagramAccountIds[0]],kind:'messages'}));await assert.rejects(s.sends.replyToCase(f.viewerCtx,own.cases[1].id,{targetId:own.message.conversationId,text:'No',requestKey:randomUUID()}));assert.equal(s.providerSends(),0);
}));

test('integratedInstagramDirectoryIsNotMislabelledAsUnsupported',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),directory=createInboxDirectory({db:f.db,access:s.access});const result=await directory.listInboxAccounts(f.adminCtx,{platform:'instagram'});assert.equal(result.items[0].capabilities.find(v=>v.capability==='messages.read')?.reason,'verification_required');assert.equal(result.items[0].capabilities.find(v=>v.capability==='mentions.read')?.reason,'not_integrated');assert.doesNotMatch(JSON.stringify(result),/sealed:|instagram_business/);
}));

test('independentRuntimeBuildsTheActualEngagementAdapterWithoutOpeningItsGates',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),runtime=createInstagramManagementRuntime({db:f.db,config:{enabled:true,appId:'456',appSecret:'synthetic',graphVersion:'v25.0',callbackUrl:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',requiredScopes:['instagram_business_basic','instagram_business_manage_messages']},policy:s.policy,encrypt:v=>v,decrypt:v=>v,fetchImpl:async()=>{throw Error('no provider traffic allowed');}});
 assert.equal(typeof (runtime as any).engagement?.detail,'function');const asset=await s.access.resolveInboxAsset(f.adminCtx,f.instagramAccountIds[0]);const caps=await (runtime as any).engagement.capabilities(asset);assert.ok(caps.every((v:any)=>!v.available));
}));

test('messageSearchReadsOnlyTheSelectedLiveInstagramSourceOnce',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),own=await seedDeletionCustomer(f),query={accountIds:[f.instagramAccountIds[0]],kind:'messages',q:'Synthetic message',searchMessages:true};
 assert.deepEqual((await s.reads.listCases(f.adminCtx,query)).items.map(v=>v.id),[own.cases[1].id]);
 assert.deepEqual((await s.reads.listCases(f.adminCtx,{...query,accountIds:[f.accountIds[0]]})).items,[]);
 await f.db.instagramInteractionMessage.update({where:{id:own.message.id},data:{occurredAt:new Date(Date.now()-91*86400000)}});assert.deepEqual((await s.reads.listCases(f.adminCtx,query)).items,[]);
}));

test('fiftyAccountCursorScopeStillBounded',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f);await f.seedVerifiedCase();await seedDeletionCustomer(f);const accountIds=[f.accountIds[0],f.instagramAccountIds[0],...Array.from({length:48},()=>randomUUID())],q={accountIds,kind:'messages',limit:1};
 const first=await s.reads.listCases(f.adminCtx,q);assert.equal(first.items.length,1);assert.ok(first.nextCursor);assert.ok(first.nextCursor.length<=2048);const second=await s.reads.listCases(f.adminCtx,{...q,cursor:first.nextCursor});assert.equal(second.items.length,1);assert.notEqual(first.items[0].id,second.items[0].id);await assert.rejects(s.reads.listCases(f.adminCtx,{...q,accountIds:accountIds.slice(0,49),cursor:first.nextCursor}));
}));

test('messagesOnlyIndependentGrantCanProjectWithoutRequestingCommentPermission',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),own=await seedDeletionCustomer(f);await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{scopes:['instagram_business_basic','instagram_business_manage_messages']}});
 const asset=await s.access.resolveInboxAsset(f.adminCtx,f.instagramAccountIds[0],'messages.read'),items=await s.registry.getInboxAdapter('instagram').normalizeVerifiedEvent([own.message.id],asset);assert.equal(items.length,1);await s.projection.projectVerifiedPage(f.adminCtx,asset,{items,nextCursor:null,coverage:'synthetic',warnings:[]});
}));

test('renewalAfterInstagramReadCannotProjectOldBodyOrCustomer',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),own=await seedDeletionCustomer(f),asset=await s.access.resolveInboxAsset(f.adminCtx,f.instagramAccountIds[0],'messages.read'),items=await s.registry.getInboxAdapter('instagram').normalizeVerifiedEvent([own.message.id],asset),before=await f.db.interactionCustomer.count({where:{workspaceId:f.adminCtx.workspaceId}});
 await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{version:{increment:1}}});await assert.rejects(s.projection.projectVerifiedPage(f.adminCtx,asset,{items,nextCursor:null,coverage:'synthetic',warnings:[]}));assert.equal(await f.db.interactionCustomer.count({where:{workspaceId:f.adminCtx.workspaceId}}),before);
}));

test('freshInstagramProjectionCreatesOnlyScopedReferencesAndNoSecondBody',async()=>withMetaInboxFixture(async f=>{
 const s=await setup(f),asset=await s.access.resolveInboxAsset(f.adminCtx,f.instagramAccountIds[0],'messages.read'),row=await f.db.instagramInteractionMessage.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,providerId:'new-message',conversationId:'local:new',actorId:'301',inbound:true,text:'Private body only in source',occurredAt:new Date()}}),items=await s.registry.getInboxAdapter('instagram').normalizeVerifiedEvent([row.id],asset),before=await f.publishingSnapshot();
 assert.equal((await s.projection.projectVerifiedPage(f.adminCtx,asset,{items,nextCursor:null,coverage:'synthetic',warnings:[]})).count,1);const c=await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId,providerThreadOrEventId:'local:new'},include:{items:true,asset:true}});assert.equal(c.asset.instagramConnectionId,f.instagramConnectionIds[0]);assert.equal(c.asset.facebookManagedPageId,null);assert.equal(c.items.length,1);assert.equal(c.items[0].text,null);assert.doesNotMatch(JSON.stringify(c),/Private body/);assert.deepEqual(await f.publishingSnapshot(),before);
}));
