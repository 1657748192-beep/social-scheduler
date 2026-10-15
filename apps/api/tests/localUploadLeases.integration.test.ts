import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createLocalUploadFixture} from './helpers/localUploadFixture';

test('atomic leases enforce part, session and global limits and compare release tokens', async t => {
  const f = await createLocalUploadFixture(t);
  const {createUploadLeases} = await import('../src/uploads/local/leases');
  const leases = createUploadLeases(f.redis, f.prefix), sid = randomUUID();
  const a = await leases.acquire(sid,0); assert.ok(a.ok);
  assert.deepEqual(await leases.acquire(sid,0), {ok:false,reason:'part_busy'});
  const b = await leases.acquire(sid,1); assert.ok(b.ok);
  assert.deepEqual(await leases.acquire(sid,2), {ok:false,reason:'session_busy'});
  await leases.release({...a.lease,token:randomUUID()});
  assert.equal(await leases.active(sid),true);
  assert.deepEqual(await leases.acquire(sid,0), {ok:false,reason:'part_busy'});
  await leases.release(a.lease);
  const c = await leases.acquire(sid,0); assert.ok(c.ok);
  await leases.release(a.lease);
  assert.deepEqual(await leases.acquire(sid,0), {ok:false,reason:'part_busy'});
  const more = await Promise.all(Array.from({length:10}, () => leases.acquire(randomUUID(),0)));
  assert.equal(more.filter(x=>x.ok).length,6);
  assert.equal(more.filter(x=>!x.ok && x.reason==='server_busy').length,4);
});

test('expired leases are pruned atomically and Redis unavailable fails closed', async t => {
  const f = await createLocalUploadFixture(t);
  const {createUploadLeases} = await import('../src/uploads/local/leases');
  const leases = createUploadLeases(f.redis,f.prefix), sid=randomUUID();
  const first=await leases.acquire(sid,0); assert.ok(first.ok);
  // The random test prefix is ours; advance only this lease's expiration.
  const keys=await f.redis.keys(`${f.prefix}:*`);
  for (const key of keys) if (await f.redis.type(key)==='zset') await f.redis.zadd(key,0,`${sid}:0:${first.lease.token}`);
  const next=await leases.acquire(sid,0); assert.ok(next.ok);
  await leases.release(first.lease);
  assert.equal(await leases.active(sid),true);
  f.redis.disconnect();
  assert.deepEqual(await leases.acquire(randomUUID(),0),{ok:false,reason:'unavailable'});
  await assert.rejects(leases.active(sid));
});
