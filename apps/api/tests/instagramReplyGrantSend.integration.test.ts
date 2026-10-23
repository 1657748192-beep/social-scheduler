import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedRec3Fixture,cleanRec3Fixture} from './helpers/instagramReplyGrantFixture';import {createInstagramRecordingGrants} from '../src/instagramManagement/recordingGrants';import {createInstagramSendExecutor} from '../src/instagramManagement/sendAttempts';
import {parseInstagramReplyRecording} from '../src/instagramManagement/replyRecording';
import {closeInstagramRecordingGrants} from '../src/instagramManagement/recordingGrantLifecycle';
async function setup(f:any){const s=await seedRec3Fixture(f),grants=createInstagramRecordingGrants({db:f.db,rule:s.rule,policy:s.policy,now:()=>s.now,isDeleted:async()=>false});await grants.prepare(s.asset,s.source);return{...s,grants,executor:()=>createInstagramSendExecutor({db:f.db,testRestriction:s.rule,recordingGrants:grants,now:()=>s.now} as any)};}

for(const boundary of ['closed','fixed-expiry'])test('REC3 dispatch rejects a claimed qualification after '+boundary,async()=>withMetaInboxFixture(async f=>{try{
 const s=await seedRec3Fixture(f),policy=boundary==='fixed-expiry'?{...s.policy,requireAsset:(...args:Parameters<typeof s.policy.requireAsset>)=>({...s.policy.requireAsset(...args),replyWindowMs:35000})}:s.policy,grants=createInstagramRecordingGrants({db:f.db,rule:s.rule,policy,now:()=>s.now,isDeleted:async()=>false});
 await grants.prepare(s.asset,s.source);let calls=0;
 const guarded={...grants,claim:async(input:any)=>{const claimed=await grants.claim(input);
  if(boundary==='closed')await f.db.$transaction(tx=>closeInstagramRecordingGrants(tx,{workspaceId:s.rule.workspaceId,platform:'instagram',appId:s.rule.appId,providerAssetId:s.rule.providerAccountId,connectionId:s.rule.connectionId,connectionVersion:1},10,s.now));
  if(boundary==='fixed-expiry'){
   s.now=new Date(+s.now+6000);
   await f.db.instagramInteractionMessage.create({data:{workspaceId:s.rule.workspaceId,connectionId:s.rule.connectionId,connectionVersion:1,providerId:'newer-inbound',actorId:'300',conversationId:s.rec3.conversationId,inbound:true,text:'later inbound',occurredAt:s.now,receivedAt:s.now}});
  }
  return claimed;
 }};
 const executor=createInstagramSendExecutor({db:f.db,testRestriction:s.rule,recordingGrants:guarded,now:()=>s.now});
 await assert.rejects(executor.execute(s.input(),async()=>{calls++;return{status:'sent',providerId:'must-not-dispatch'};}));assert.equal(calls,0);
}finally{await cleanRec3Fixture(f);}}));
test('REC3 concurrent executors and new request keys consume one original attempt without changing old records',async()=>withMetaInboxFixture(async f=>{try{
 const s=await setup(f),before=await s.oldSnapshot();let calls=0;const send=async()=>{calls++;return{status:'sent' as const,providerId:'rec3-confirmed'};};
 const input=s.input();const results=await Promise.all([s.executor().execute(input,send),s.executor().execute(s.input(),send)]);assert.equal(calls,1);assert.ok(results.some(v=>v.status==='sent'));
 await s.executor().execute(input,send);await s.executor().execute(s.input(),send);assert.equal(calls,1);
 const grant=await f.db.instagramReplyRecordingGrant.findFirstOrThrow({where:{workspaceId:s.rule.workspaceId}});assert.equal(grant.state,'sent');assert.ok(grant.attemptId);assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{connectionId:s.rule.connectionId}}),3);assert.deepEqual(await s.oldSnapshot(),before);
}finally{await cleanRec3Fixture(f);}}));
test('REC3 age limit is rechecked after a durable claim and before provider dispatch',async()=>withMetaInboxFixture(async f=>{try{
 const s=await seedRec3Fixture(f);s.rawRule.messageRec3.expiresAt=new Date(+s.now+172800000).toISOString();const rule=parseInstagramReplyRecording(JSON.stringify(s.rawRule))!;
 const grants=createInstagramRecordingGrants({db:f.db,rule,policy:s.policy,now:()=>s.now,isDeleted:async()=>false});await grants.prepare(s.asset,s.source);let calls=0;
 const guarded={...grants,claim:async(input:any)=>{const value=await grants.claim(input);s.now=new Date(+s.rec3.occurredAt+86400000);return value;}};
 const executor=createInstagramSendExecutor({db:f.db,testRestriction:rule,recordingGrants:guarded,now:()=>s.now});
 await assert.rejects(executor.execute(s.input(),async()=>{calls++;return{status:'sent',providerId:'too-late'};}));assert.equal(calls,0);
}finally{await cleanRec3Fixture(f);}}));
test('REC3 failed receipt transaction retains the consumed claim and cannot dispatch again',async()=>withMetaInboxFixture(async f=>{try{
 const s=await setup(f);let calls=0;
 await f.db.$executeRawUnsafe(`CREATE FUNCTION ig_rec3_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='sent' THEN RAISE EXCEPTION 'synthetic receipt failure'; END IF; RETURN NEW; END $$`);
 await f.db.$executeRawUnsafe(`CREATE TRIGGER ig_rec3_test_receipt BEFORE UPDATE ON "InstagramReplyRecordingGrant" FOR EACH ROW EXECUTE FUNCTION ig_rec3_test_failure()`);
 const result=await s.executor().execute(s.input(),async()=>{calls++;return{status:'sent',providerId:'lost-receipt'};});assert.equal(result.status,'unknown');
 await f.db.$executeRawUnsafe('DROP TRIGGER ig_rec3_test_receipt ON "InstagramReplyRecordingGrant"');await f.db.$executeRawUnsafe('DROP FUNCTION ig_rec3_test_failure()');
 const again=await s.executor().execute(s.input(),async()=>{calls++;return{status:'sent',providerId:'must-not-send'};});assert.equal(again.status,'unknown');assert.equal(calls,1);
 assert.equal((await f.db.instagramReplyRecordingGrant.findFirstOrThrow({where:{workspaceId:s.rule.workspaceId}})).state,'claimed');
}finally{await f.db.$executeRawUnsafe('DROP TRIGGER IF EXISTS ig_rec3_test_receipt ON "InstagramReplyRecordingGrant"');await f.db.$executeRawUnsafe('DROP FUNCTION IF EXISTS ig_rec3_test_failure()');await cleanRec3Fixture(f);}}));
for(const result of ['failed','unknown','throw','malformed'] as const)test('REC3 '+result+' consumes its opportunity across requests and recreated executors',async()=>withMetaInboxFixture(async f=>{try{
 const s=await setup(f);let calls=0;const send=async()=>{calls++;if(result==='throw')throw Error('network');return result==='malformed'?{status:'sent' as const,providerId:'bad?token=x'}:{status:result,code:'rejected',diagnosticId:'test'};};
 const first=await s.executor().execute(s.input(),send);assert.equal(first.status,result==='failed'?'failed':'unknown');await s.executor().execute(s.input(),send);assert.equal(calls,1);assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{connectionId:s.rule.connectionId}}),3);
}finally{await cleanRec3Fixture(f);}}));
test('REC3 rejects old request keys and altered sources or payloads without occupying its opportunity',async()=>withMetaInboxFixture(async f=>{try{
 const s=await setup(f);let calls=0;const send=async()=>{calls++;return{status:'sent' as const,providerId:'bad'};};
 for(const patch of [{requestKey:s.legacy[1].requestKey},{text:'other'},{targetId:'999'},{source:{...s.source,sourceRecordId:s.rec2.id}},{asset:{...s.asset,ctx:f.viewerCtx}}])await assert.rejects(s.executor().execute(s.input(patch),send));
 assert.equal(calls,0);assert.equal((await f.db.instagramReplyRecordingGrant.findFirstOrThrow({where:{workspaceId:s.rule.workspaceId}})).state,'available');
}finally{await cleanRec3Fixture(f);}}));
test('REC3 a committed claim is never resumed after a crashed caller or automatic timeout',async()=>withMetaInboxFixture(async f=>{try{
 const s=await setup(f);assert.equal(typeof (s.grants as any).claim,'function');const claimed=await (s.grants as any).claim(s.input());assert.equal(claimed.fresh,true);
 let calls=0;const result=await s.executor().execute(s.input(),async()=>{calls++;return{status:'sent',providerId:'must-not-send'};});assert.equal(result.status,'unknown');assert.equal(calls,0);assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{connectionId:s.rule.connectionId}}),3);
}finally{await cleanRec3Fixture(f);}}));
