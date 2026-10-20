import test from 'node:test';import assert from 'node:assert/strict';
import express from 'express';import {once} from 'node:events';
import {baselineBundle} from '@social-scheduler/timezone-rules';
import {createHash} from 'node:crypto';
import {createRulesRouter} from '../src/timezoneRules/routes';
import {createRulesRuntime,refreshUnknownRuleZone} from '../src/timezoneRules/runtime';
import {createRuleStore} from '../src/timezoneRules/store';
import {scheduleTimeZoneSchema} from '../src/utils/scheduleTimeZone';
test('authenticated read-only rules routes protect status, bound reads and use ETags',async()=>{
 const rt=createRulesRuntime({store:{readActive:async()=>null,readVersion:async()=>baselineBundle,status:async()=>({activeVersion:'2026e',state:'baseline-only'}),tryLock:async()=>false,activate:async()=>false,release:async()=>{},record:async()=>{}},source:async()=>{throw Error('GET must not fetch upstream');}});
 const app=express();app.use('/rules',createRulesRouter(rt,{auth:(req,res,next)=>{if(!req.headers.authorization){res.sendStatus(401);return;}(req as any).user={id:req.headers.authorization,email:req.headers.authorization};next();},admin:email=>email==='admin'}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as any).port}/rules`;
 try{
  assert.equal((await fetch(origin+'/manifest')).status,401);
  assert.equal((await fetch(origin+'/status',{headers:{Authorization:'customer'}})).status,403);
  assert.equal((await fetch(origin+'/status',{headers:{Authorization:'admin'}})).status,200);
  const first=await fetch(origin+'/manifest',{headers:{Authorization:'reader'}});assert.equal(first.status,200);assert.equal((await first.json()).version,'2026e');
  assert.equal((await fetch(origin+'/manifest',{headers:{Authorization:'reader','If-None-Match':first.headers.get('etag')!}})).status,304);
  assert.equal((await fetch(origin+'/data/invalid',{headers:{Authorization:'reader'}})).status,400);
  for(let i=0;i<60;i++)assert.equal((await fetch(origin+'/manifest',{headers:{Authorization:'limited'}})).status,200);
  assert.equal((await fetch(origin+'/manifest',{headers:{Authorization:'limited'}})).status,429);
 }finally{await rt.stop();await new Promise<void>(r=>server.close(()=>r()));}
});
test('an ended Redis client reconnects on later bounded reads and unknown controlled aliases refresh before validation',async()=>{
 let connections=0;const fake:any={status:'end',connect:async()=>{connections++;fake.status='ready';},get:async()=>null};
 const store=createRuleStore(fake,{hasCapacity:async()=>true});await store.readActive();assert.equal(connections,1);fake.status='end';await store.readActive();assert.equal(connections,2);
 const b=structuredClone(baselineBundle);b.tzdbVersion=b.data.version='2026f';b.data.links.push('Asia/Shanghai|Test/New_Alias');const raw=Buffer.from(JSON.stringify(b.data));b.sourceBytes=raw.toString('base64');b.sha256=createHash('sha256').update(raw).digest('hex');
 let active=baselineBundle;
 const rt=createRulesRuntime({store:{readActive:async()=>active,readVersion:async()=>active,status:async()=>({activeVersion:active.tzdbVersion,state:'ok'}),tryLock:async()=>false,activate:async()=>false,release:async()=>{},record:async()=>{}},source:async()=>({ianaVersion:'2026e',bundle:null})});
 await rt.getBundle();active=b;assert.equal(scheduleTimeZoneSchema.safeParse('Test/New_Alias').success,false);
 await refreshUnknownRuleZone('Test/New_Alias',rt);assert.equal(scheduleTimeZoneSchema.safeParse('Test/New_Alias').success,true);assert.equal(scheduleTimeZoneSchema.safeParse('Test/Other_Unknown').success,false);
 active=baselineBundle;await rt.refreshBundle();await rt.stop();
});
test('runtime is inert until start and aborts in-flight checks on stop',async()=>{
 let calls=0,aborted=false;
 const rt=createRulesRuntime({store:{readActive:async()=>null,readVersion:async()=>null,status:async()=>({activeVersion:'2026e',state:'baseline-only'}),tryLock:async()=>true,activate:async()=>false,release:async()=>{},record:async()=>{}},source:signal=>new Promise((_resolve,reject)=>{calls++;signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true});})});
 assert.equal(calls,0);rt.start();await new Promise(r=>setImmediate(r));assert.equal(calls,1);await rt.stop();assert.equal(aborted,true);
 assert.equal(scheduleTimeZoneSchema.safeParse('Asia/Kathmandu').success,true);for(const id of ['CST','UTC+8','Unknown/Zone'])assert.equal(scheduleTimeZoneSchema.safeParse(id).success,false);
});
