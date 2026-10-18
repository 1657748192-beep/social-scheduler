import test from 'node:test';import assert from 'node:assert/strict';
import {withInboxFixture} from './helpers/interactionInboxFixture';import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createInboxAccess} from '../src/interactionInbox/access';import {createInboxProjection} from '../src/interactionInbox/projection';import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';import {inboxSourceAlive} from '../src/interactionInbox/sourceLifetime';import {createInboxRetention} from '../src/interactionInbox/retention';
import {createInboxReads} from '../src/interactionInbox/reads';
const policy=(f:any,days=1)=>createLiveInboxPolicy(f.workspaceIds.map((workspaceId:string)=>({workspaceId,platform:'facebook',appId:'123',providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:1,contentRetentionDays:days,replyWindowMs:1000,reviewed:true}})));
const access=(f:any,p:any)=>createInboxAccess({db:f.db,policy:p,facebookEnabled:true,verifyFacebook:async()=>({readMessages:{status:'available'},readComments:{status:'available'}})});

test('caseAccessActuallyUsesItsConfiguredShorterBodyPolicy',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(),old=new Date(Date.now()-2*86400000),row=await f.db.facebookInteractionMessage.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:'expired-by-policy',participantId:'300',senderId:'300',recipientId:'100',text:'Synthetic expired body',occurredAt:old}});
 await f.db.interactionCase.update({where:{id:c.id},data:{sourceRef:{...(c.sourceRef as object),sourceRecordId:row.id}}});await assert.rejects(access(f,policy(f)).resolveCase(f.adminCtx,c.id));
}));

test('projectionDoesNotPersistExpiredGraphItemsOrTheirCustomerIdentity',async()=>withInboxFixture(async f=>{
 const p=policy(f),a=access(f,p),asset=await a.resolveInboxAsset(f.adminCtx,f.accountIds[0]),projection=createInboxProjection({db:f.db,access:a,policy:p});
 const result=await projection.projectVerifiedPage(f.adminCtx,asset,{items:[{providerEventId:'too-old',threadId:'old-thread',actorId:'300',actorName:'Expired synthetic visitor',kind:'messages',occurredAt:new Date(Date.now()-2*86400000).toISOString(),inbound:true,deleted:false,sourceRef:{...asset.sourceRef!,conversationId:'old-thread',participantId:'300'}}],nextCursor:null,coverage:'synthetic',warnings:[]});
 assert.equal(result.count,0);assert.equal(await f.db.interactionCustomer.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));

test('longLivedFacebookConversationWithRecentInboundRemainsReadable',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase();await f.db.interactionCase.update({where:{id:c.id},data:{createdAt:new Date(Date.now()-91*86400000)}});assert.equal((await access(f,policy(f,90)).resolveCase(f.adminCtx,c.id)).row.id,c.id);
}));

test('freshIndependentBodyDoesNotExpireOnlyBecauseItsCaseWasCreatedEarlier',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),old=new Date(Date.now()-91*86400000),c=await f.db.interactionCase.update({where:{id:own.cases[1].id},data:{createdAt:old}});
 assert.equal(await inboxSourceAlive(f.db,c.sourceRef as any,old,new Date()),true);await createInboxRetention({db:f.db}).pruneInbox(new Date(),50);assert.equal((await f.db.interactionCase.findUniqueOrThrow({where:{id:c.id}})).version,1);
}));

test('listCountsAndPaginationExcludeShorterPolicyExpiredSourcesBeforeDetailLookup',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(),p=policy(f),a=access(f,p),row=await f.db.facebookInteractionMessage.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:'expired-list-item',participantId:'300',senderId:'300',recipientId:'100',text:'Synthetic expired',occurredAt:new Date(Date.now()-2*86400000)}});
 await f.db.interactionCase.update({where:{id:c.id},data:{sourceRef:{...(c.sourceRef as object),sourceRecordId:row.id}}});await f.db.interactionSyncState.create({data:{workspaceId:c.workspaceId,assetId:c.assetId,kind:'messages',status:'ok',lastSuccessAt:new Date()}});
 const reads=createInboxReads({db:f.db,access:a,registry:{} as any,redis:{eval:async()=>1} as any,policy:p} as any),result=await reads.listCases(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'messages',limit:25});
 assert.deepEqual(result.items,[]);assert.equal(result.accountsStatus[0].count,0);assert.equal(result.nextCursor,null);
}));
