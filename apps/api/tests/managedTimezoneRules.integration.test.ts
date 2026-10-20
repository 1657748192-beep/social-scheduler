import test from 'node:test';import assert from 'node:assert/strict';
import IORedis from 'ioredis';import {randomUUID,createHash} from 'node:crypto';
import {baselineBundle,type RuleBundle} from '@social-scheduler/timezone-rules';
import {createRuleStore,cacheHeadroom} from '../src/timezoneRules/store';
import {checkRulesOnce} from '../src/timezoneRules/updater';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
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

test('real Redis activation uses fresh host evidence without changing credentials, jobs or Redis configuration',()=>withFacebookManagementFixture(async f=>{
 const env=require('../../../scripts/run-tests.cjs').environment(true,true);
 require('../../../scripts/local-upload-test-environment.cjs').validateLocalUploadTestEnvironment(env);
 const redis=new IORedis(env.LOCAL_UPLOAD_TEST_REDIS_URL,{maxRetriesPerRequest:1});
 const root=await mkdtemp(join(tmpdir(),'timezone-capacity-live-')),prefix=`timezone-rules:v1:test-${randomUUID()}:`;
 try{
  const before=await f.snapshot(),configBefore=await redis.config('GET','maxmemory','maxmemory-policy');
  const runId=/^run_id:([a-f0-9]{40})/m.exec(await redis.info('server'))![1];
  assert.match(await redis.info('memory'),/^maxmemory:0\r?$/m);
  await writeFile(join(root,'binding.json'),JSON.stringify({schemaVersion:1,redisRunId:runId,levels:1}));
  await writeFile(join(root,'meminfo'),'MemTotal: 3813268 kB\nMemAvailable: 2348972 kB\n');
  await mkdir(join(root,'level-0'));await writeFile(join(root,'level-0/memory.max'),'max');await writeFile(join(root,'level-0/memory.current'),'8005048');
  const store=createRuleStore(redis,{prefix,hasCapacity:()=>cacheHeadroom(redis,{root})});
  assert.equal(await store.tryLock('verified',120000),true);
  await writeFile(join(root,'meminfo'),'MemTotal: 3813268 kB\nMemAvailable: 100000 kB\n');
  assert.equal(await store.activate('verified',next()),false);assert.equal(await redis.get(prefix+'active'),null);
  await writeFile(join(root,'meminfo'),'MemTotal: 3813268 kB\nMemAvailable: 2348972 kB\n');
  assert.equal(await store.activate('verified',next()),true);assert.equal((await store.readActive())?.tzdbVersion,'2026f');
  await store.release('verified');
  assert.deepEqual(await f.snapshot(),before);assert.deepEqual(await redis.config('GET','maxmemory','maxmemory-policy'),configBefore);
 }finally{await redis.del(prefix+'active',prefix+'previous',prefix+'lock',prefix+'status');redis.disconnect();await rm(root,{recursive:true,force:true});}
}));
