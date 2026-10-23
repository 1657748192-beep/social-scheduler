import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedRec3Fixture,cleanRec3Fixture} from './helpers/instagramReplyGrantFixture';import {createInstagramRecordingGrants} from '../src/instagramManagement/recordingGrants';import {createInstagramManagementEngagement} from '../src/instagramManagement/engagement';import {presentInboxCase} from '../src/interactionInbox/cases';

test('REC3 final engagement fence rejects fixed expiry reached during fresh access inspection despite a later inbound',async()=>withMetaInboxFixture(async f=>{try{
 const s=await seedRec3Fixture(f),policy={...s.policy,requireAsset:(...args:Parameters<typeof s.policy.requireAsset>)=>({...s.policy.requireAsset(...args),replyWindowMs:35000})};
 const grants=createInstagramRecordingGrants({db:f.db,rule:s.rule,policy,now:()=>s.now,isDeleted:async()=>false});await grants.prepare(s.asset,s.source);let sends=0,advanced=false;
 const access={...s.access,resolve:async(...args:Parameters<typeof s.access.resolve>)=>{
  const asset=await s.access.resolve(...args);
  if(!advanced&&await f.db.instagramReplyRecordingGrant.findFirst({where:{workspaceId:s.rule.workspaceId,state:'claimed'}})){
   advanced=true;s.now=new Date(+s.now+6000);
   await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'fresh-later-inbound',actorId:'300',conversationId:s.rec3.conversationId,inbound:true,text:'later inbound',occurredAt:s.now,receivedAt:s.now}});
  }return asset;
 }};
 const engagement=createInstagramManagementEngagement({db:f.db,access,policy,now:()=>s.now,testRestriction:s.rule,isDeleted:async()=>false,verifiedCommentLimit:1000,graph:()=>({conversation:async()=>({id:s.rec3.conversationId,participants:{data:[{id:'100'},{id:'300'}]}}),sendMessage:async()=>{sends++;return{status:'sent',providerId:'must-not-send'};}} as any)});
 const result=await engagement.reply(s.asset,s.source,s.text,randomUUID());assert.equal(result.status,'unknown');assert.equal(advanced,true);assert.equal(sends,0);
 assert.equal((await f.db.instagramReplyRecordingGrant.findFirstOrThrow({where:{workspaceId:s.rule.workspaceId}})).state,'unknown');
}finally{await cleanRec3Fixture(f);}}));
test('REC3 detail and list use its original receipt, not the older reply to the same sender',async()=>withMetaInboxFixture(async f=>{try{
 const s=await seedRec3Fixture(f),grants=createInstagramRecordingGrants({db:f.db,rule:s.rule,policy:s.policy,now:()=>s.now,isDeleted:async()=>false});await grants.prepare(s.asset,s.source);let sends=0;
 const engagement=createInstagramManagementEngagement({db:f.db,access:s.access,policy:s.policy,now:()=>new Date(),testRestriction:s.rule,isDeleted:async()=>false,verifiedCommentLimit:1000,graph:()=>({conversation:async()=>({id:s.rec3.conversationId,participants:{data:[{id:'100'},{id:'300'}]}}),sendMessage:async()=>{sends++;return{status:'sent',providerId:'rec3-real-reply'};}} as any)});
 const asset=await f.db.interactionAsset.create({data:{workspaceId:s.rule.workspaceId,canonicalKey:s.asset.canonicalKey,platform:'instagram',appNamespace:'456',providerAssetId:'100',instagramConnectionId:s.rule.connectionId,connectionVersion:1}});
 const c=await f.db.interactionCase.create({data:{workspaceId:s.rule.workspaceId,assetId:asset.id,kind:'messages',providerThreadOrEventId:'thread-rec3',sourceRef:s.source,lastInboundAt:s.rec3.occurredAt,lastInboundKey:s.rec3.providerId}});
 const before=await engagement.detail(s.asset,s.source);assert.equal(before.recordingReply?.state,'available');assert.equal((before.recordingReply as any)?.mode,'incoming_message_once');assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,s.asset.accountId)).replied,false);
 const result=await engagement.reply(s.asset,s.source,s.text,randomUUID());assert.equal(result.status,'sent');assert.equal(sends,1);
 const detail=await engagement.detail(s.asset,s.source);assert.equal(detail.recordingReply?.state,'used');assert.equal(detail.items.filter(v=>v.id==='rec3-real-reply'&&v.text===s.text&&!v.inbound).length,1);assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,s.asset.accountId)).replied,true);
 await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'rec3-real-reply',actorId:'300',conversationId:s.rec3.conversationId,inbound:false,text:s.text,occurredAt:new Date()}});
 const cached=await engagement.detail(s.asset,s.source);assert.equal(cached.recordingReply?.state,'used');assert.equal(cached.items.filter(v=>v.id==='rec3-real-reply').length,1);
 const grant=await f.db.instagramReplyRecordingGrant.findFirstOrThrow({where:{workspaceId:s.rule.workspaceId}}),attempt=await f.db.instagramInteractionSendAttempt.findUniqueOrThrow({where:{id:grant.attemptId!}});
 const later=await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'later-inbound',actorId:'300',conversationId:s.rec3.conversationId,inbound:true,text:'another question',occurredAt:attempt.createdAt}});assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,s.asset.accountId)).replied,false);
 await f.db.interactionCase.update({where:{id:c.id},data:{sourceRef:{...s.source,sourceRecordId:later.id}}});assert.equal((await presentInboxCase(f.db,f.adminCtx,c.id,s.asset.accountId)).replied,false);
}finally{await cleanRec3Fixture(f);}}));
