import test from 'node:test';import assert from 'node:assert/strict';import Redis from 'ioredis';import {withInboxFixture} from './helpers/interactionInboxFixture';import {inboxTestAccess} from './helpers/interactionInboxServices';import {createInboxProjection} from '../src/interactionInbox/projection';
import {inboxTestPolicy} from './helpers/interactionInboxServices';

test('deleted young source and unattended expiry invalidate and prune customer indexes',async()=>withInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(),source=await f.db.facebookInteractionMessage.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:'source-prune',participantId:'300',senderId:'300',recipientId:'100',text:'original',occurredAt:new Date()}});
 await f.db.interactionCase.update({where:{id:c.id},data:{sourceRef:{...(c.sourceRef as object),sourceRecordId:source.id}}});
 await f.db.facebookInteractionMessage.delete({where:{id:source.id}});const access=inboxTestAccess(f);await assert.rejects(access.resolveCase(f.adminCtx,c.id),(e:any)=>e.statusCode===404);
 const {createInboxRetention}=await import('../src/interactionInbox/retention');await createInboxRetention({db:f.db}).pruneInbox(new Date(),50);
 assert.equal(await f.db.interactionCase.count({where:{id:c.id}}),0);assert.equal(await f.db.interactionIdentity.count({where:{customerId:c.customerId!}}),0);
 const expired=await f.seedVerifiedCase(0,'expired');await f.db.interactionCase.update({where:{id:expired.id},data:{createdAt:new Date('2020-01-01'),lastInboundAt:new Date('2020-01-01')}});
 await assert.rejects(access.resolveCase(f.adminCtx,expired.id));await createInboxRetention({db:f.db}).pruneInbox(new Date(),50);assert.equal(await f.db.interactionCase.count({where:{id:expired.id}}),0);
}));
test('verifiedEventsOnlyAndReplayDoesNotReopenResolvedCase',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/reception').catch(()=>null);assert.ok(m,'refresh/reception service required');const access=inboxTestAccess(f),projection=createInboxProjection({db:f.db,access,policy:inboxTestPolicy(f)}),asset=await access.resolveInboxAsset(f.adminCtx,f.accountIds[0]);
 const make=(id:string,time:string)=>({providerEventId:id,threadId:'thread',actorId:'300',actorName:'Customer',kind:'messages' as const,occurredAt:time,inbound:true,deleted:false,sourceRef:{...asset.sourceRef!,conversationId:'thread',participantId:'300'}});
 const one=make('m1','2026-10-01T00:00:00Z');await projection.projectVerifiedPage(f.adminCtx,asset,{items:[one],nextCursor:null,coverage:'test',warnings:[]});const c=await f.db.interactionCase.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId}});await f.db.interactionCase.update({where:{id:c.id},data:{status:'resolved'}});
 await projection.projectVerifiedPage(f.adminCtx,asset,{items:[one,make('older','2026-09-30T23:59:00Z')],nextCursor:null,coverage:'test',warnings:[]});assert.equal((await f.db.interactionCase.findUniqueOrThrow({where:{id:c.id}})).status,'resolved');
 await projection.projectVerifiedPage(f.adminCtx,asset,{items:[make('same-time-new','2026-10-01T00:00:00Z')],nextCursor:null,coverage:'test',warnings:[]});assert.equal((await f.db.interactionCase.findUniqueOrThrow({where:{id:c.id}})).status,'pending');
}));
test('refreshIsSharedAcrossTabs and disabled platforms never call adapters',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/reception').catch(()=>null);assert.ok(m);const redis=new Redis(require('../../../scripts/run-tests.cjs').environment(true,true).LOCAL_UPLOAD_TEST_REDIS_URL);let calls=0;
 try{const access=inboxTestAccess(f),s=m.createInboxReception({db:f.db,access,redis,projection:createInboxProjection({db:f.db,access,policy:inboxTestPolicy(f)}),registry:{getInboxAdapter:()=>({list:async()=>{calls++;return{items:[],nextCursor:null,coverage:'synthetic',warnings:[]};},normalizeVerifiedEvent:async()=>[]})} as any});
 await s.refreshInbox(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'messages'});await assert.rejects(s.refreshInbox(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'messages'}),(e:any)=>e.statusCode===429);assert.equal(calls,1);
 assert.equal(await s.projectFacebookSourceBatch(['unknown'],new Date()),0);
 }finally{redis.disconnect();}
}));
test('pruningNeverExtendsSourceRetention',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/retention').catch(()=>null);assert.ok(m,'inbox retention required');const c=await f.seedVerifiedCase(),before=await f.protectedSnapshot();
 await f.db.interactionItem.create({data:{workspaceId:c.workspaceId,assetId:c.assetId,caseId:c.id,platform:'facebook',providerEventId:'expired',direction:'inbound',occurredAt:new Date('2020-01-01'),receivedAt:new Date('2020-01-01'),sourceRef:c.sourceRef!}});
 const s=m.createInboxRetention({db:f.db});assert.equal(await s.pruneInbox(new Date(),50),1);assert.equal(await f.db.interactionItem.count({where:{caseId:c.id}}),0);assert.deepEqual(await f.protectedSnapshot(),before);
}));
test('provider failure marks cached synchronization stale without losing successful timestamp',async()=>withInboxFixture(async f=>{
 const m=await import('../src/interactionInbox/reception');const redis=new Redis(require('../../../scripts/run-tests.cjs').environment(true,true).LOCAL_UPLOAD_TEST_REDIS_URL);
 try{const c=await f.seedVerifiedCase(),at=new Date(),access=inboxTestAccess(f);await f.db.interactionSyncState.create({data:{workspaceId:c.workspaceId,assetId:c.assetId,kind:'messages',status:'ok',lastSuccessAt:at}});
 const s=m.createInboxReception({db:f.db,access,redis,projection:createInboxProjection({db:f.db,access,policy:inboxTestPolicy(f)}),registry:{getInboxAdapter:()=>({list:async()=>{throw Error('offline');}})} as any});await s.refreshInbox(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'messages'});
 const state=await f.db.interactionSyncState.findUniqueOrThrow({where:{assetId_kind:{assetId:c.assetId,kind:'messages'}}});assert.equal(state.status,'error');assert.equal(state.lastSuccessAt?.getTime(),at.getTime());
 }finally{redis.disconnect();}
}));
