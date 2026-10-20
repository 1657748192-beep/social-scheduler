import test from 'node:test';import assert from 'node:assert/strict';
import IORedis from 'ioredis';import {randomUUID,createHash} from 'node:crypto';
import {baselineBundle,type RuleBundle} from '@social-scheduler/timezone-rules';
import {createRuleStore,cacheHeadroom} from '../src/timezoneRules/store';
import {checkRulesOnce} from '../src/timezoneRules/updater';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
function next():RuleBundle{const b=structuredClone(baselineBundle);b.tzdbVersion=b.data.version='2026f';const raw=Buffer.from(JSON.stringify(b.data));b.sourceBytes=raw.toString('base64');b.sha256=createHash('sha256').update(raw).digest('hex');return b;}
test('real rules cache survives restart, fences stale owners and preserves credentials and unrelated Redis hashes',()=>withFacebookManagementFixture(async f=>{
 const env=require('../../../scripts/run-tests.cjs').environment(true,true);
 require('../../../scripts/local-upload-test-environment.cjs').validateLocalUploadTestEnvironment(env);
 const redis=new IORedis(env.LOCAL_UPLOAD_TEST_REDIS_URL,{maxRetriesPerRequest:1}),prefix=`timezone-rules:v1:test-${randomUUID()}:`,protectedKey=`managed-protected-${randomUUID()}`;
 const before=await f.snapshot();await redis.hset(protectedKey,{data:'unchanged publish payload',timestamp:'123',delay:'86400000'});const protectedBefore=await redis.hgetall(protectedKey);
 try{
  const store=createRuleStore(redis,{prefix,hasCapacity:async()=>true}),candidate=next();
  assert.equal((await checkRulesOnce({store,source:async()=>({ianaVersion:'2026f',bundle:candidate})})).state,'ok');
  const reopened=createRuleStore(redis,{prefix,hasCapacity:async()=>true});assert.equal((await reopened.readActive())?.sha256,candidate.sha256);
  assert.equal(await store.tryLock('stale',120000),true);await redis.set(prefix+'lock','new-owner','PX',120000);
  assert.equal(await store.activate('stale',baselineBundle),false);await store.release('stale');assert.equal(await redis.get(prefix+'lock'),'new-owner');
  await store.release('new-owner');
  const pressure=createRuleStore(redis,{prefix,hasCapacity:async()=>false});assert.equal(await pressure.tryLock('pressure',120000),false);assert.equal(await pressure.activate('pressure',baselineBundle),false);
  await redis.set(prefix+'active','corrupt');assert.equal(await reopened.readActive(),null);
  assert.deepEqual(await f.snapshot(),before);assert.deepEqual(await redis.hgetall(protectedKey),protectedBefore);
  assert.equal(await cacheHeadroom({info:async()=> 'used_memory:1024\r\nmaxmemory:1048576\r\ntotal_system_memory:9999999999\r\n'} as any),false);
 }finally{await redis.del(prefix+'active',prefix+'previous',prefix+'lock',prefix+'status',protectedKey);redis.disconnect();}
}));
