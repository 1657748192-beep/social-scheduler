import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';import {createMetaSourceRetention} from '../src/interactionInbox/retention';import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';import {createFacebookSendExecutor} from '../src/facebookManagement/sendAttempts';
const asset=(f:any)=>({workspaceId:f.workspaceIds[0],platform:'facebook' as const,appId:'123',providerAssetId:'100',connectionId:f.connections[0].id,connectionVersion:1});

test('facebookRawRetentionUsesSevenDayCapAndABoundedBatch',async()=>withFacebookManagementFixture(async f=>{
 const now=new Date(),cutoff=now.getTime()-7*86400000,before=await f.snapshot(),service=createMetaSourceRetention({db:f.db,policy:createLiveInboxPolicy([])});
 for(const delta of [-1,0,1])await f.db.facebookInteractionEvent.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,eventKey:String(delta),payload:{synthetic:true},receivedAt:new Date(cutoff+delta)}});
 assert.equal(await(service as any).pruneFacebook(asset(f),now,1,'raw'),1);assert.deepEqual((await f.db.facebookInteractionEvent.findMany({where:{managedPageId:f.pages[0].id},orderBy:{eventKey:'asc'}})).map((r:any)=>r.eventKey),['0','1']);assert.deepEqual(await f.snapshot(),before);
}));

test('facebookShorterPolicyExpiresEitherBodyClockButPreservesNewerEpoch',async()=>withFacebookManagementFixture(async f=>{
 const a=asset(f),now=new Date(),cutoff=now.getTime()-86400000;
 const policy=createLiveInboxPolicy([{workspaceId:a.workspaceId,platform:'facebook',appId:a.appId,providerAssetId:a.providerAssetId,readEnabled:false,sendEnabled:false,policy:{product:'synthetic-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:1,contentRetentionDays:1,replyWindowMs:1000,reviewed:true}}]),service=createMetaSourceRetention({db:f.db,policy});
 for(const [id,occurredAt,receivedAt,version]of [['expired-body',new Date(cutoff-1),now,1],['expired-receipt',now,new Date(cutoff-1),1],['boundary',new Date(cutoff),now,1],['newer',new Date(cutoff-1),now,2]] as const)await f.db.facebookInteractionMessage.create({data:{managedPageId:f.pages[0].id,connectionVersion:version,providerId:id,participantId:'300',senderId:'300',recipientId:'100',occurredAt,receivedAt,text:'Synthetic only'}});
 assert.equal(await(service as any).pruneFacebook(a,now,50,'messages'),2);assert.deepEqual((await f.db.facebookInteractionMessage.findMany({where:{managedPageId:f.pages[0].id},orderBy:{providerId:'asc'}})).map((r:any)=>r.providerId),['boundary','newer']);
}));

test('facebookExpiredSendMetadataIsScrubbedWithoutReenablingTheConsumedKey',async()=>withFacebookManagementFixture(async f=>{
 const now=new Date(),input={requestKey:randomUUID(),kind:'message' as const,targetId:'300',text:'Synthetic original body'},executor=createFacebookSendExecutor({db:f.db});let sends=0;
 await executor.executeFacebookSend(f.contexts[0],input,async()=>{sends++;return{status:'sent',providerId:'synthetic-sent'};});await f.db.facebookInteractionSendAttempt.updateMany({where:{managedPageId:f.pages[0].id},data:{createdAt:new Date(now.getTime()-91*86400000)}});
 const service=createMetaSourceRetention({db:f.db,policy:createLiveInboxPolicy([])});assert.equal(await(service as any).pruneFacebook(asset(f),now,50,'sends'),1);
 const row=await f.db.facebookInteractionSendAttempt.findUniqueOrThrow({where:{managedPageId_requestKey:{managedPageId:f.pages[0].id,requestKey:input.requestKey}}});assert.equal(row.payloadHash,'deleted');assert.equal(row.providerId,null);
 await assert.rejects(executor.executeFacebookSend(f.contexts[0],input,async()=>{sends++;return{status:'sent',providerId:'must-not-send'};}));assert.equal(sends,1);
}));
