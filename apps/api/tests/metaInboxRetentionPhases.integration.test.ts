import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {createMetaSourceRetention} from '../src/interactionInbox/retention';import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
const asset=(f:any)=>({workspaceId:f.adminCtx.workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1});

test('explicitBodyPhaseCannotBeStarvedByAnExpiredRawBacklog',async()=>withMetaInboxFixture(async f=>{
 const a=asset(f),now=new Date(),old=new Date(now.getTime()-91*86400000),service=createMetaSourceRetention({db:f.db,policy:createLiveInboxPolicy([])});
 for(let i=0;i<2;i++)await f.db.instagramInteractionEvent.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:1,eventKey:String(i),payload:{synthetic:true},receivedAt:old}});
 await f.db.instagramInteractionMessage.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:1,providerId:'expired',conversationId:'thread',actorId:'300',inbound:true,text:'Synthetic expired body',occurredAt:old,receivedAt:old}});
 assert.equal(await(service as any).pruneInstagram(a,now,1,'messages'),1);assert.equal(await f.db.instagramInteractionEvent.count({where:{connectionId:a.connectionId}}),2);assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId:a.connectionId}}),0);
}));

test('instagramSendRetentionKeepsConsumedUuidButForgetsOldTargetMetadata',async()=>withMetaInboxFixture(async f=>{
 const a=asset(f),now=new Date(),requestKey=randomUUID(),service=createMetaSourceRetention({db:f.db,policy:createLiveInboxPolicy([])});
 const row=await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:a.workspaceId,connectionId:a.connectionId,connectionVersion:1,requestKey,targetHash:'a'.repeat(64),payloadHash:'b'.repeat(64),providerId:'synthetic-sent',status:'sent',createdAt:new Date(now.getTime()-91*86400000)}});
 assert.equal(await(service as any).pruneInstagram(a,now,1,'sends'),1);const kept=await f.db.instagramInteractionSendAttempt.findUniqueOrThrow({where:{id:row.id}});assert.equal(kept.requestKey,requestKey);assert.equal(kept.targetHash,'deleted');assert.equal(kept.payloadHash,'deleted');assert.equal(kept.providerId,null);assert.equal(kept.status,'unknown');
}));
