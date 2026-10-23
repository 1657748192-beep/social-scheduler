import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedRec3Fixture,cleanRec3Fixture} from './helpers/instagramReplyGrantFixture';
async function service(f:any){const m=await import('../src/instagramManagement/recordingGrants').catch(()=>null);assert.ok(m?.createInstagramRecordingGrants,'REC3 qualification service required');const s=await seedRec3Fixture(f);return Object.assign(s,{grants:m.createInstagramRecordingGrants({db:f.db,rule:s.rule,policy:s.policy,now:()=>s.now,isDeleted:async()=>false})});}
test('same sender receives one REC3 grant without rewriting REC1 or REC2',async()=>withMetaInboxFixture(async f=>{try{
 const s=await service(f),before=await s.oldSnapshot();assert.equal(await s.grants.read(s.asset,s.source),null);
 const a=await s.grants.prepare(s.asset,s.source),b=await s.grants.prepare(s.asset,s.source);assert.equal(a.id,b.id);assert.equal(a.state,'available');assert.equal(await f.db.instagramReplyRecordingGrant.count({where:{workspaceId:f.adminCtx.workspaceId}}),1);assert.deepEqual(await s.oldSnapshot(),before);
 await assert.rejects(s.grants.prepare(s.asset,{...s.source,sourceRecordId:randomUUID()}));assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{connectionId:s.rule.connectionId}}),2);
}finally{await cleanRec3Fixture(f);}}));
for(const mode of ['wrong actor','wrong account','equal time','old time','unknown send','deleted','duplicate marker','bare duplicate marker','copied predecessor','expired','reauthorized'] as const)test('REC3 preparation fails closed: '+mode,async()=>withMetaInboxFixture(async f=>{try{
 const s=await service(f);let asset=s.asset,source=s.source;
 if(mode==='wrong actor')source={...source,participantId:'999'};
 if(mode==='wrong account')asset={...asset,accountId:f.instagramAccountIds[1]};
 if(mode==='equal time'||mode==='old time')await f.db.instagramInteractionMessage.update({where:{id:s.rec3.id},data:{occurredAt:new Date(+s.legacy[1].updatedAt-(mode==='old time'?1:0))}});
 if(mode==='unknown send')await f.db.instagramInteractionSendAttempt.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,requestKey:randomUUID(),targetHash:s.legacy[1].targetHash,payloadHash:'unknown',status:'unknown'}});
 if(mode==='deleted')await f.db.instagramInteractionMessage.update({where:{id:s.rec3.id},data:{deleted:true}});
 if(mode==='duplicate marker')await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'duplicate-rec3',actorId:'300',inbound:true,conversationId:s.rec3.conversationId,text:s.rec3.text,occurredAt:s.now}});
 if(mode==='bare duplicate marker')await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'bare-rec3',actorId:'300',inbound:true,conversationId:s.rec3.conversationId,text:'SS-IG-DM-1023-REC3',occurredAt:s.now}});
 if(mode==='copied predecessor')await f.db.interactionAudit.deleteMany({where:{targetId:s.rule.connectionId}});
 if(mode==='expired')s.now=new Date(+s.now+86400000);
 if(mode==='reauthorized')await f.db.instagramManagementConnection.update({where:{id:s.rule.connectionId},data:{version:2}});
 await assert.rejects(s.grants.prepare(asset,source));assert.equal(await f.db.instagramReplyRecordingGrant.count({where:{workspaceId:s.rule.workspaceId}}),0);
}finally{await cleanRec3Fixture(f);}}));
