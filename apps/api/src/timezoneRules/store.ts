import type Redis from 'ioredis';
import {readFile} from 'node:fs/promises';
import {baselineBundle,validateBundle,type RuleBundle} from '@social-scheduler/timezone-rules';
import type {RuleStore,RuleStatus} from './updater';
export async function cacheHeadroom(redis:Redis):Promise<boolean>{
 try{
  const memory=await redis.info('memory');const read=(key:string)=>Number(new RegExp(`^${key}:(\\d+)`,'m').exec(memory)?.[1]??NaN);
  const used=read('used_memory'),max=read('maxmemory'),total=read('total_system_memory');
  if(!Number.isFinite(used)||!Number.isFinite(max))return false;
  if(max>0)return max-used>=32*1024*1024;
  // Host-reported total alone does not prove the Redis container limit; unbounded Redis is not safe to cache into.
  void total;await readFile('/sys/fs/cgroup/memory.max','utf8').catch(()=>undefined);
  return false;
 }catch{return false;}
}
export function createRuleStore(redis:Redis,{prefix='timezone-rules:v1:',hasCapacity=()=>cacheHeadroom(redis)}:{prefix?:string;hasCapacity?:()=>Promise<boolean>}={}):RuleStore & {readVersion(version:string):Promise<RuleBundle|null>}{
 if(!/^timezone-rules:v1:(?:test-[a-z0-9-]+:)?$/.test(prefix))throw Error('Invalid rules namespace');
 const key=(part:string)=>prefix+part;
 async function read(part:string){try{const s=await redis.get(key(part));return s?validateBundle(JSON.parse(s)):null;}catch{return null;}}
 return {
  readActive:()=>read('active'),
  async readVersion(version){for(const part of ['active','previous']){const bundle=await read(part);if(bundle?.tzdbVersion===version)return bundle;}return version===baselineBundle.tzdbVersion?baselineBundle:null;},
  async tryLock(owner,ttlMs){if(!await hasCapacity())return false;return await redis.set(key('lock'),owner,'PX',ttlMs,'NX')==='OK';},
  async activate(owner,bundle){
   const valid=validateBundle(bundle);if(!await hasCapacity())return false;
   const value=JSON.stringify(valid);if(Buffer.byteLength(value)>4*1024*1024)return false;
   return Number(await redis.eval(`if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
local old=redis.call('GET',KEYS[2]); if old then redis.call('SET',KEYS[3],old) end
redis.call('SET',KEYS[2],ARGV[2]); return 1`,3,key('lock'),key('active'),key('previous'),owner,value))===1;
  },
  async release(owner){await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,key('lock'),owner);},
  async record(status){await redis.set(key('status'),JSON.stringify(status));},
  async status(){try{const raw=await redis.get(key('status'));if(raw){const s=JSON.parse(raw);if(['ok','pending-upstream','failed','baseline-only'].includes(s.state)&&typeof s.activeVersion==='string')return s;}}catch{}return {activeVersion:baselineBundle.tzdbVersion,state:'baseline-only'};}
 };
}
