import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import {createInstagramManagementAccess} from '../src/instagramManagement/access';
import {createInstagramManagementEngagement} from '../src/instagramManagement/engagement';
import {createInboxAccess} from '../src/interactionInbox/access';
import {createInboxProjection} from '../src/interactionInbox/projection';
import {createInboxReads} from '../src/interactionInbox/reads';
import {createInboxCustomers} from '../src/interactionInbox/customers';
async function services(f:MetaInboxFixture,graph:any={}){
 const scopes=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
 const policy=createLiveInboxPolicy(f.workspaceIds.map(workspaceId=>({workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:1,contentRetentionDays:1,replyWindowMs:86400000,reviewed:true}})));
 const igAccess=createInstagramManagementAccess({db:f.db,appId:'456',policy,decrypt:v=>v,inspect:async()=>({appId:'456',providerAccountId:'100',scopes,expiresAt:new Date(Date.now()+86400000)})});
 const engagement=createInstagramManagementEngagement({db:f.db,access:igAccess,policy,graph:()=>graph,isDeleted:async()=>false,verifiedCommentLimit:1000});
 const access=createInboxAccess({db:f.db,facebookEnabled:false,instagram:{enabled:true,access:igAccess},policy,verifyFacebook:async()=>{throw Error('Facebook out of scope');}});
 const asset=await igAccess.resolve(f.adminCtx,f.instagramAccountIds[0],'messages.read'),projection=createInboxProjection({db:f.db,access,policy});
 const reads=createInboxReads({db:f.db,access,policy,registry:{getInboxAdapter:()=>engagement} as any,redis:{eval:async()=>{throw Error('Search not used');}}});
 return{asset,engagement,projection,reads,customers:createInboxCustomers({db:f.db,access}),query:{accountIds:[asset.accountId],kind:'messages',limit:25}};
}
test('comment nested author username reaches verified identity metadata without an extra lookup',async()=>withMetaInboxFixture(async f=>{
 const {asset,engagement}=await services(f,{media:async()=>({items:[{id:'media'}],nextCursor:null}),comments:async()=>({items:[{id:'nested-comment',text:'Test',from:{id:'300',username:'visitor.nested'},timestamp:new Date().toISOString()}],nextCursor:null})});
 const page=await engagement.list(asset,'comments',null,1);assert.equal((page.items[0] as any).actorUsername,'visitor.nested');
 assert.equal((await f.db.instagramInteractionComment.findFirstOrThrow({where:{providerId:'nested-comment',connectionId:f.instagramConnectionIds[0]}})).actorName,'visitor.nested');
 assert.equal((await engagement.normalizeVerifiedEvent([page.items[0].sourceRef.sourceRecordId!],asset))[0].actorUsername,'visitor.nested');
}));
test('missing customer username stays anonymous even when the business has a username',async()=>withMetaInboxFixture(async f=>{
 const thread={id:'anonymous-thread',participants:{data:[{id:'100',username:'business.own'},{id:'300'}]}},s=await services(f,{conversations:async()=>({items:[thread],nextCursor:null}),conversation:async()=>thread,messages:async()=>({items:[{id:'anonymous-message',from:{id:'300'},to:{data:[{id:'100',username:'business.own'}]},message:'Test',created_time:new Date().toISOString()}],nextCursor:null})});
 const page=await s.engagement.list(s.asset,'messages',null,1);assert.equal(page.items[0].actorUsername,null);await s.projection.projectVerifiedPage(f.adminCtx,s.asset,page);assert.equal((await s.reads.listCases(f.adminCtx,s.query)).items[0].customerName,null);
}));
test('message usernames follow the verified counterparty ID for both directions, never the business',async()=>withMetaInboxFixture(async f=>{
 const thread={id:'thread',participants:{data:[{id:'100',username:'business.own'},{id:'300',username:'visitor.parent'}]}};
 const {asset,engagement}=await services(f,{conversations:async()=>({items:[thread],nextCursor:null}),conversation:async()=>thread,messages:async()=>({items:[{id:'incoming',from:{id:'300'},to:{data:[{id:'100',username:'business.own'}]},message:'Question',created_time:new Date().toISOString()},{id:'outgoing',from:{id:'100',username:'business.own'},to:{data:[{id:'300',username:'visitor.parent'}]},message:'Existing reply',created_time:new Date().toISOString()}],nextCursor:null})});
 const page=await engagement.list(asset,'messages',null,25);assert.deepEqual(page.items.map(v=>[v.actorId,(v as any).actorUsername,v.inbound]),[['300','visitor.parent',true],['300','visitor.parent',false]]);
 assert.ok((await engagement.capabilities(asset)).filter(v=>v.capability.endsWith('.reply')).every(v=>!v.available));
}));
test('duplicate verified projection fills a blank username without creating a customer, overwriting a name or crossing accounts',async()=>withMetaInboxFixture(async f=>{
 const s=await services(f),before=await f.publishingSnapshot();
 const body=await f.db.instagramInteractionMessage.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,providerId:'test-message',conversationId:'local:test',actorId:'300',inbound:true,text:'Test',occurredAt:new Date()}});
 const items=await s.engagement.normalizeVerifiedEvent([body.id],s.asset),page={items,nextCursor:null,coverage:'verified_received_sources',warnings:[]};await s.projection.projectVerifiedPage(f.adminCtx,s.asset,page);
 const identity=await f.db.interactionIdentity.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId,platform:'instagram'}}),caseRow=await f.db.interactionCase.findFirstOrThrow({where:{customerId:identity.customerId}});
 const foreignAsset=await f.db.interactionAsset.create({data:{workspaceId:f.foreignCtx.workspaceId,canonicalKey:s.asset.canonicalKey,platform:'instagram',appNamespace:'456',providerAssetId:'100',instagramConnectionId:f.instagramConnectionIds[1],connectionVersion:1}}),foreignCustomer=await f.db.interactionCustomer.create({data:{workspaceId:f.foreignCtx.workspaceId}});
 await f.db.interactionIdentity.create({data:{workspaceId:f.foreignCtx.workspaceId,assetId:foreignAsset.id,customerId:foreignCustomer.id,platform:'instagram',appNamespace:'456',providerActorId:'300'}});
 const verified={...page,items:items.map(v=>({...v,actorUsername:'visitor.verified'}))};await s.projection.projectVerifiedPage(f.adminCtx,s.asset,verified);
 assert.equal((await f.db.interactionIdentity.findUniqueOrThrow({where:{id:identity.id}})).username,'visitor.verified');assert.equal(await f.db.interactionCustomer.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);
 assert.equal((await f.db.interactionIdentity.findFirstOrThrow({where:{assetId:foreignAsset.id}})).username,null);
 const listed=await s.reads.listCases(f.adminCtx,s.query);assert.equal(listed.items[0].customerName,'visitor.verified');
 const customer=await s.customers.getCustomer(f.adminCtx,identity.customerId);assert.equal(customer.name,'visitor.verified');assert.equal(customer.identities[0].name,null);assert.equal(customer.identities[0].username,'visitor.verified');
 await f.db.interactionIdentity.update({where:{id:identity.id},data:{displayName:'Existing display name'}});
 await s.projection.projectVerifiedPage(f.adminCtx,s.asset,{...page,items:items.map(v=>({...v,actorUsername:'different.username'}))});
 const preserved=await f.db.interactionIdentity.findUniqueOrThrow({where:{id:identity.id}});assert.equal(preserved.username,'visitor.verified');assert.equal(preserved.displayName,'Existing display name');assert.equal(await f.db.interactionItem.count({where:{caseId:caseRow.id}}),1);
 await f.db.interactionIdentity.update({where:{id:identity.id},data:{username:null}});await f.db.instagramInteractionMessage.update({where:{id:body.id},data:{occurredAt:new Date(Date.now()-2*86400000)}});await s.projection.projectVerifiedPage(f.adminCtx,s.asset,verified);assert.equal((await f.db.interactionIdentity.findUniqueOrThrow({where:{id:identity.id}})).username,null);
 await f.db.instagramInteractionMessage.update({where:{id:body.id},data:{occurredAt:new Date(),deleted:true}});await s.projection.projectVerifiedPage(f.adminCtx,s.asset,verified);assert.equal((await f.db.interactionIdentity.findUniqueOrThrow({where:{id:identity.id}})).username,null);
 await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{version:2}});await assert.rejects(s.projection.projectVerifiedPage(f.adminCtx,s.asset,verified));assert.equal((await f.db.interactionIdentity.findUniqueOrThrow({where:{id:identity.id}})).username,null);
 assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('available indexed Instagram records are separate from incomplete history and never hide errors, filters or expired sources',async()=>withMetaInboxFixture(async f=>{
 const s=await services(f),body=await f.db.instagramInteractionMessage.create({data:{workspaceId:f.adminCtx.workspaceId,connectionId:f.instagramConnectionIds[0],connectionVersion:1,providerId:'coverage-message',conversationId:'local:coverage',actorId:'300',inbound:true,text:'Coverage test',occurredAt:new Date()}}),items=await s.engagement.normalizeVerifiedEvent([body.id],s.asset);
 await s.projection.projectVerifiedPage(f.adminCtx,s.asset,{items,nextCursor:null,coverage:'verified_received_sources',warnings:[]});const c=await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId}});
 const check=async(status:string)=>{const result=await s.reads.listCases(f.adminCtx,s.query);assert.equal(result.accountsStatus[0].status,status);assert.equal(result.accountsStatus[0].count,null);assert.equal((result.accountsStatus[0] as any).synchronizedCount,1);assert.equal(result.partial,true);};
 await check('not_synced');for(const status of ['incomplete','error']){await f.db.interactionSyncState.upsert({where:{assetId_kind:{assetId:c.assetId,kind:'messages'}},create:{workspaceId:f.adminCtx.workspaceId,assetId:c.assetId,kind:'messages',status},update:{status}});await check(status);}
 assert.equal(((await s.reads.listCases(f.adminCtx,{...s.query,status:'resolved'})).accountsStatus[0] as any).synchronizedCount,0);
 await f.db.instagramInteractionMessage.update({where:{id:body.id},data:{occurredAt:new Date(Date.now()-2*86400000)}});assert.equal(((await s.reads.listCases(f.adminCtx,s.query)).accountsStatus[0] as any).synchronizedCount,0);
 await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{status:'inactive'}});const unavailable=await s.reads.listCases(f.adminCtx,s.query);assert.equal(unavailable.items.length,0);assert.equal(unavailable.accountsStatus[0].status,'unavailable');assert.equal((unavailable.accountsStatus[0] as any).synchronizedCount,undefined);
}));
