import assert from 'node:assert/strict';
import test from 'node:test';
import Redis from 'ioredis';
import {randomBytes,randomUUID} from 'node:crypto';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
test('sync store is encrypted, session scoped, TTL bounded, atomic and cannot cancel an accepted import',async()=>{
 const mod=await import('../src/facebookPageSync/store').catch(()=>null);assert.ok(mod);
 const env=require('../../../scripts/run-tests.cjs').environment(true,true),redis=new Redis(env.LOCAL_UPLOAD_TEST_REDIS_URL);
 const ctx={userId:randomUUID(),sessionId:randomUUID(),workspaceId:randomUUID()},id=randomBytes(32).toString('base64url'),state='fbps_'+id;
 const store=mod.createFacebookPageSyncStore({redis,encrypt:encryptToken,decrypt:decryptToken});
 try{
  await store.createState(ctx,state);assert.ok((await redis.ttl('facebook-page-sync:v1:state:'+state))<=600);
  const consumed=await Promise.all([store.consumeState(state),store.consumeState(state)]);assert.equal(consumed.filter(Boolean).length,1);
  await store.saveCandidates(ctx,id,{pages:[{pageId:'100',name:'Page',avatarUrl:null,profileUrl:'https://www.facebook.com/100',pageToken:'secret-page-token',scopes:['pages_manage_posts'],expiresAt:new Date(Date.now()+3600000)}],rejected:[]});
  const key='facebook-page-sync:v1:sync:'+id,raw=await redis.get(key);assert.doesNotMatch(raw!,/secret-page-token/);const ttl=await redis.pttl(key);assert.ok(ttl<=900000&&ttl>0);
  await assert.rejects(store.read({...ctx,sessionId:randomUUID()},id));assert.ok((await store.read(ctx,id))!.pages[0].expiresAt instanceof Date);
  const claim=await store.claim(ctx,id,'confirm','hash');await assert.rejects(store.claim(ctx,id,'cancel'));await assert.rejects(store.claim(ctx,id,'confirm','different'));
  assert.equal((await store.claim(ctx,id,'confirm','hash')).leaseId,claim.leaseId);
  await assert.rejects(store.finish(ctx,id,'stale',{createdPageIds:['100'],skippedPageIds:[]}));
  await store.finish(ctx,id,claim.leaseId,{createdPageIds:['100'],skippedPageIds:[]});assert.equal((await store.read(ctx,id))!.pages.length,0);assert.ok((await redis.pttl(key))<=ttl);assert.doesNotMatch((await redis.get(key))!,/secret-page-token/);
  await redis.pexpire(key,1);await new Promise(r=>setTimeout(r,10));assert.equal(await store.read(ctx,id),null);
  await store.saveCandidates(ctx,id,{pages:[],rejected:[]});const cancelled=await store.claim(ctx,id,'cancel');await assert.rejects(store.claim(ctx,id,'confirm','hash'));await store.cancel(ctx,id,cancelled.leaseId);assert.equal(await store.read(ctx,id),null);
  await redis.disconnect();await assert.rejects(store.createState(ctx,state));
 }finally{if(redis.status!=='end'){await redis.del('facebook-page-sync:v1:state:'+state,'facebook-page-sync:v1:sync:'+id);redis.disconnect();}}
});
