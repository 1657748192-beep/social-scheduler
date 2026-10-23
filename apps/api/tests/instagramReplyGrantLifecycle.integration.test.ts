import test from 'node:test';import assert from 'node:assert/strict';import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedRec3Fixture,cleanRec3Fixture} from './helpers/instagramReplyGrantFixture';import {createInstagramRecordingGrants} from '../src/instagramManagement/recordingGrants';import {createMetaSourceRetention} from '../src/interactionInbox/retention';
test('REC3 deletion scrubs only its scope, keeps the consumed identity until safe expiry, then cannot recreate it',async()=>withMetaInboxFixture(async f=>{try{
 const module=await import('../src/instagramManagement/recordingGrantLifecycle').catch(()=>null);assert.ok(module?.closeInstagramRecordingGrants,'REC3 grant lifecycle required');
 const s=await seedRec3Fixture(f),grants=createInstagramRecordingGrants({db:f.db,rule:s.rule,policy:s.policy,now:()=>s.now,isDeleted:async()=>false}),g=await grants.prepare(s.asset,s.source),before=await s.oldSnapshot();
 const scope={workspaceId:s.rule.workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',connectionId:s.rule.connectionId,connectionVersion:1};
 assert.equal(await f.db.$transaction(tx=>module.closeInstagramRecordingGrants(tx,{...scope,workspaceId:f.workspaceIds[1]},1,s.now)),0);
 assert.equal(await f.db.$transaction(tx=>module.closeInstagramRecordingGrants(tx,scope,1,s.now)),1);
 const closed=await f.db.instagramReplyRecordingGrant.findUniqueOrThrow({where:{id:g.id}});assert.equal(closed.state,'closed');assert.equal(closed.actorId,null);assert.equal(closed.sourceRecordId,null);assert.equal(closed.attemptId,null);await assert.rejects(grants.prepare(s.asset,s.source));
 assert.equal(await f.db.$transaction(tx=>module.purgeClosedInstagramRecordingGrants(tx,1,g.forgetAfter)),0);
 assert.equal(await f.db.$transaction(tx=>module.purgeClosedInstagramRecordingGrants(tx,1,new Date(+g.forgetAfter+1))),1);
 s.now=new Date(+g.forgetAfter+1);await assert.rejects(grants.prepare(s.asset,s.source));assert.deepEqual(await s.oldSnapshot(),before);
}finally{await cleanRec3Fixture(f);}}));
test('REC3 retention closes an expired opportunity within the existing single-entity budget',async()=>withMetaInboxFixture(async f=>{try{
 const s=await seedRec3Fixture(f),grants=createInstagramRecordingGrants({db:f.db,rule:s.rule,policy:s.policy,now:()=>s.now,isDeleted:async()=>false}),g=await grants.prepare(s.asset,s.source);
 const retention=createMetaSourceRetention({db:f.db,policy:s.policy});assert.equal(await retention.pruneInstagram({workspaceId:s.rule.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:s.rule.connectionId,connectionVersion:1},new Date(+g.expiresAt+1),1,'messages'),1);
 assert.equal((await f.db.instagramReplyRecordingGrant.findUniqueOrThrow({where:{id:g.id}})).state,'closed');assert.ok(await f.db.instagramInteractionMessage.findUnique({where:{id:s.rec3.id}}));
}finally{await cleanRec3Fixture(f);}}));
