import assert from 'node:assert/strict';import test from 'node:test';import Redis from 'ioredis';
const load=async()=>import('../src/facebookPageImportInvitations/flows').catch(()=>null);
async function fixture(run:(flows:any)=>Promise<void>){const env=require('../../../scripts/run-tests.cjs').environment(true,true);const redis=new Redis(env.LOCAL_UPLOAD_TEST_REDIS_URL);try{const mod=await load();assert.ok(mod,'public flow store must exist');await run(mod.createInvitationFlows(redis));}finally{redis.disconnect();}}
test('wrong cookie cannot consume state, and competing browser flows fail closed',()=>fixture(async flows=>{
 const {randomUUID}=await import('node:crypto'),invitationId=randomUUID();const flow=await flows.begin({invitationId,version:1});
 await assert.rejects(flows.consume(flow.state,'wrong-cookie'));await assert.rejects(flows.begin({invitationId,version:1}));
 await assert.rejects(flows.begin({invitationId:randomUUID(),version:1},flow.cookie.value));
 const consumed=await flows.consume(flow.state,flow.cookie.value);assert.equal(consumed.invitationId,invitationId);
 await assert.rejects(flows.consume(flow.state,flow.cookie.value));await flows.release(consumed);
 const next=await flows.begin({invitationId,version:1});await flows.release(await flows.consume(next.state,next.cookie.value));
}));
test('expired flows reject and rate limits fail closed after the allowed attempts',()=>fixture(async flows=>{
 const {randomUUID}=await import('node:crypto'),invitationId=randomUUID(),flow=await flows.begin({invitationId,version:1},undefined,new Date(Date.now()-601000));
 await assert.rejects(flows.consume(flow.state,flow.cookie.value));assert.equal(await flows.active(flow),false);await flows.release(flow);
 const key='test-'+randomUUID();for(let i=0;i<5;i++)await flows.rateLimit(key,5);await assert.rejects(flows.rateLimit(key,5));
}));
