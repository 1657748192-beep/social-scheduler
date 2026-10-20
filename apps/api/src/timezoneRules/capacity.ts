import type Redis from 'ioredis';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const reserve=32*1024*1024;
const probeRoot='/run/social-scheduler/timezone-capacity';
function unsigned(value:string|undefined){
 if(value===undefined||!/^\d+$/.test(value))throw Error('Invalid memory metric');
 const number=Number(value);if(!Number.isSafeInteger(number))throw Error('Invalid memory metric');
 return number;
}
function field(text:string,key:string){
 const lines=text.split(/\r?\n/).filter(line=>line.startsWith(key+':'));
 if(lines.length!==1)throw Error('Missing or duplicate memory metric');
 return lines[0].slice(key.length+1);
}

/** Only deployment-verified, read-only host/Redis cgroup files may enable the
 * maxmemory=0 fallback. Never infer Redis capacity from the API's own cgroup.
 * A Redis restart invalidates the binding until deployment verifies it again. */
export async function cacheHeadroom(redis:Redis,{root=probeRoot}:{root?:string}={}):Promise<boolean>{
 try{
  const memory=await redis.info('memory');
  const used=unsigned(field(memory,'used_memory')),max=unsigned(field(memory,'maxmemory'));
  if(max>0)return max-used>=reserve;
  const raw=await readFile(join(root,'binding.json'),'utf8');if(raw.length>4096)return false;
  const binding=JSON.parse(raw);
  if(binding.schemaVersion!==1||!Number.isInteger(binding.levels)||binding.levels<1||binding.levels>16||!/^([a-f0-9]{40})$/.test(binding.redisRunId))return false;
  if(field(await redis.info('server'),'run_id')!==binding.redisRunId)return false;
  const meminfo=await readFile(join(root,'meminfo'),'utf8');
  const hostMetric=(key:string)=>unsigned(/^\s*(\d+) kB$/.exec(field(meminfo,key))?.[1])*1024;
  const total=hostMetric('MemTotal'),available=hostMetric('MemAvailable');
  // Keep at least 10% of host RAM (and never less than 256MiB) untouched,
  // in addition to the cache budget. MemAvailable is read fresh, not persisted.
  if(!Number.isSafeInteger(total)||total<=0||available>total||available<Math.max(256*1024*1024,Math.ceil(total/10))+reserve)return false;
  for(let i=0;i<binding.levels;i++){
   const level=join(root,`level-${i}`);
   const [limitText,currentText]=await Promise.all([readFile(join(level,'memory.max'),'utf8'),readFile(join(level,'memory.current'),'utf8')]);
   const current=unsigned(currentText.trim()),limit=limitText.trim();
   if(limit!=='max'&&unsigned(limit)-current<reserve)return false;
  }
  return true;
 }catch{return false;}
}
