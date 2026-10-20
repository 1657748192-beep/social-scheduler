import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cacheHeadroom} from '../src/timezoneRules/store';

const runId='b0e3ec60c5ab90df75cd27cf3395a40e651dc4d3';
const mib=1024*1024;
function redis(memory='used_memory:8005048\r\nmaxmemory:0\r\ntotal_system_memory:3904786432\r\n',id=runId){
 return {info:async(section:string)=>{if(section==='memory')return memory;if(section==='server')return `run_id:${id}\r\n`;throw Error('Unexpected INFO section');}} as any;
}
async function fixture(fn:(root:string)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'timezone-capacity-'));
 try{
  await writeFile(join(root,'binding.json'),JSON.stringify({schemaVersion:1,redisRunId:runId,levels:2}));
  await writeFile(join(root,'meminfo'),'MemTotal: 3813268 kB\nMemAvailable: 2348972 kB\n');
  for(let i=0;i<2;i++){await mkdir(join(root,`level-${i}`));await writeFile(join(root,`level-${i}/memory.max`),'max\n');await writeFile(join(root,`level-${i}/memory.current`),'8005048\n');}
  await fn(root);
 }finally{await rm(root,{recursive:true,force:true});}
}
// A blanket maxmemory=0 refusal causes the first test to fail. A blanket allowance
// would fail the pressure, missing-evidence, ancestor-limit and stale-run cases.
test('unbounded Redis accepts fresh verified host and all ancestor capacity evidence',()=>fixture(async root=>{
 assert.equal(await cacheHeadroom(redis(),{root}),true);
 await writeFile(join(root,'level-0/memory.max'),String(128*mib));
 await writeFile(join(root,'level-0/memory.current'),String(64*mib));
 assert.equal(await cacheHeadroom(redis(),{root}),true);
}));
test('low host availability blocks caching despite abundant Redis and API memory',()=>fixture(async root=>{
 await writeFile(join(root,'meminfo'),'MemTotal: 3813268 kB\nMemAvailable: 300000 kB\n');
 assert.equal(await cacheHeadroom(redis(),{root}),false);
}));
test('a tight Redis leaf or parent cgroup blocks caching and a later recovery is read fresh',()=>fixture(async root=>{
 for(const level of ['level-0','level-1']){
  await writeFile(join(root,`${level}/memory.max`),String(128*mib));
  await writeFile(join(root,`${level}/memory.current`),String(110*mib));
  assert.equal(await cacheHeadroom(redis(),{root}),false);
  await writeFile(join(root,`${level}/memory.current`),String(64*mib));
  assert.equal(await cacheHeadroom(redis(),{root}),true);
 }
}));
test('missing, malformed or stale host/container evidence never enables the fallback',()=>fixture(async root=>{
 assert.equal(await cacheHeadroom(redis(undefined,'f'.repeat(40)),{root}),false);
 const binding=await import('node:fs/promises').then(fs=>fs.readFile(join(root,'binding.json'),'utf8'));
 for(const invalid of ['{}','not json',JSON.stringify({schemaVersion:1,redisRunId:runId,levels:0}),JSON.stringify({schemaVersion:1,redisRunId:runId,levels:17})]){
  await writeFile(join(root,'binding.json'),invalid);assert.equal(await cacheHeadroom(redis(),{root}),false);
 }
 await writeFile(join(root,'binding.json'),binding);
 for(const invalid of ['MemTotal: 3813268 kB\n','MemTotal: 100 kB\nMemAvailable: 200 kB\n','MemTotal: 3813268 kB\nMemAvailable: -1 kB\n']){
  await writeFile(join(root,'meminfo'),invalid);assert.equal(await cacheHeadroom(redis(),{root}),false);
 }
 await writeFile(join(root,'meminfo'),'MemTotal: 3813268 kB\nMemAvailable: 2348972 kB\n');
 await writeFile(join(root,'level-1/memory.max'),'unknown');assert.equal(await cacheHeadroom(redis(),{root}),false);
 await writeFile(join(root,'level-1/memory.max'),'max');await rm(join(root,'level-1/memory.current'));assert.equal(await cacheHeadroom(redis(),{root}),false);
 assert.equal(await cacheHeadroom(redis(),{root:join(root,'absent')}),false);
}));
test('explicit Redis limits stay enforced and invalid memory fields fail closed',()=>fixture(async root=>{
 assert.equal(await cacheHeadroom(redis(`used_memory:${110*mib}\r\nmaxmemory:${128*mib}\r\n`),{root}),false);
 assert.equal(await cacheHeadroom(redis(`used_memory:${64*mib}\r\nmaxmemory:${128*mib}\r\n`),{root}),true);
 for(const invalid of ['used_memory:-1\r\nmaxmemory:0\r\n','used_memory:1\r\nmaxmemory:-1\r\n','used_memory:1oops\r\nmaxmemory:0\r\n','maxmemory:0\r\n'])assert.equal(await cacheHeadroom(redis(invalid),{root}),false);
 assert.equal(await cacheHeadroom({info:async()=>{throw Error('Unavailable');}} as any,{root}),false);
}));
