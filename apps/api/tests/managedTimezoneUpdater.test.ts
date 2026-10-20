import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {baselineBundle,type RuleBundle} from '@social-scheduler/timezone-rules';
import {fetchCandidate} from '../src/timezoneRules/source';
import {checkRulesOnce,type RuleStore,type RuleStatus} from '../src/timezoneRules/updater';
function next(version='2026f'):RuleBundle{const b=structuredClone(baselineBundle);b.tzdbVersion=b.data.version=version;const bytes=Buffer.from(JSON.stringify(b.data));b.sourceBytes=bytes.toString('base64');b.sha256=createHash('sha256').update(bytes).digest('hex');return b;}
function memory(){let active=baselineBundle,previous:RuleBundle|null=null,owner='',writes=0,status:RuleStatus={activeVersion:active.tzdbVersion,state:'baseline-only'};const store:RuleStore={readActive:async()=>active,tryLock:async key=>{if(owner)return false;owner=key;return true;},activate:async(key,b)=>{if(owner!==key)return false;previous=active;active=b;writes++;return true;},release:async key=>{if(owner===key)owner='';},record:async s=>{status=s;},status:async()=>status};return {store,get active(){return active;},get previous(){return previous;},get writes(){return writes;},expire:()=>{owner='another-owner';}};}
test('validated upgrade is atomic, preserves previous, and never rewrites identical data',async()=>{
 const m=memory();const result=await checkRulesOnce({store:m.store,source:async()=>({ianaVersion:'2026f',bundle:next()}),now:()=>123});
 assert.equal(result.state,'ok');assert.equal(m.active.tzdbVersion,'2026f');assert.equal(m.previous?.sha256,baselineBundle.sha256);assert.equal(m.writes,1);
 await checkRulesOnce({store:m.store,source:async()=>({ianaVersion:'2026f',bundle:next()}),now:()=>124});assert.equal(m.writes,1);
});
test('same-version conflicts, downgrades, corrupt data and failures leave active untouched',async()=>{
 for(const candidate of [next('2026d'),{...next(),sha256:'0'.repeat(64)},next('2026e'),{...next(),engineCompatibility:2}]){
  const m=memory();const result=await checkRulesOnce({store:m.store,source:async()=>({ianaVersion:'2026f',bundle:candidate as RuleBundle}),now:()=>123});
  assert.notEqual(result.state,'ok');assert.equal(m.writes,0);assert.equal(m.active.sha256,baselineBundle.sha256);
 }
 const m=memory();assert.equal((await checkRulesOnce({store:m.store,source:async()=>{throw Error('network');},now:()=>123})).state,'failed');assert.equal(m.writes,0);
});
test('upstream lag and expired lock cannot activate any candidate',async()=>{
 const m=memory();assert.equal((await checkRulesOnce({store:m.store,source:async()=>({ianaVersion:'2026g',bundle:next()}),now:()=>123})).state,'pending-upstream');assert.equal(m.writes,0);
 const n=memory();assert.equal((await checkRulesOnce({store:n.store,source:async()=>{n.expire();return {ianaVersion:'2026f',bundle:next()};},now:()=>123})).state,'failed');assert.equal(n.writes,0);
});
test('fixed upstream source only reads bounded official JSON and refuses redirects or tag injection',async()=>{
 const seen:string[]=[];const sha='a'.repeat(40);
 const fake=async(input:string|URL|Request,init?:RequestInit)=>{const url=String(input);seen.push(url);assert.equal(init?.redirect,'error');return new Response(url.endsWith('/version')?'2026e\n':url.includes('api.github.com')?JSON.stringify([{name:'../../bad',commit:{sha}},{name:'0.6.5',commit:{sha}}]):Buffer.from(baselineBundle.sourceBytes,'base64'),{status:200});};
 const result=await fetchCandidate({fetch:fake as typeof fetch});assert.equal(result.bundle?.tzdbVersion,'2026e');assert.equal(seen.length,3);assert.equal(seen[2],`https://raw.githubusercontent.com/moment/moment-timezone/${sha}/data/packed/latest.json`);
 await assert.rejects(()=>fetchCandidate({fetch:(async()=>new Response('x',{status:302})) as typeof fetch}));
 await assert.rejects(()=>fetchCandidate({fetch:(async()=>new Response('A'.repeat(262145))) as typeof fetch}));
});
