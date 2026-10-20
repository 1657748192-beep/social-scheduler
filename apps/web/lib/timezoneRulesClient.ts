import {getBaseline,createRuleSnapshot,validateBundle,compareVersions,type RuleSnapshot} from '@social-scheduler/timezone-rules';
import {API_BASE_URL} from './api';
import {canonicalTimeZone} from './timezoneCatalog';
let scope='',cache:RuleSnapshot|null=null,lastChecked=0;
const listeners=new Set<()=>void>();
export function onRulesAvailable(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function latestRules(){return cache??getBaseline();}
export function detectComputerZone(rules:RuleSnapshot,read=()=>Intl.DateTimeFormat().resolvedOptions().timeZone){
 try{const id=read();if(rules.canonicalZone(id))return canonicalTimeZone(id)??rules.canonicalZone(id)!;}catch{}
 return 'Asia/Shanghai';
}
export async function getRulesForNewSession({token,signal}:{token:string;signal?:AbortSignal}):Promise<RuleSnapshot>{
 if(scope!==token){scope=token;cache=null;lastChecked=0;}
 if(!token||Date.now()-lastChecked<86400000)return latestRules();
 lastChecked=Date.now();const own=token;
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(),2000);
 try{
  async function read(path:string,limit:number){
   const r=await fetch(`${API_BASE_URL}${path}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'});
   if(!r.ok||!r.body)throw Error('rules unavailable');
   const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit)throw Error('rules too large');chunks.push(item.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }
  const m=await read('/timezone-rules/manifest',4096);
  if(m.schemaVersion!==1||m.engineCompatibility!==1||!/^\d{4}[a-z]{1,2}$/.test(m.version)||!/^[a-f0-9]{64}$/.test(m.digest))throw Error('rules manifest');
  const old=latestRules();if(m.digest===old.digest)return old;
  if(compareVersions(m.version,old.version)<=0)throw Error('rules downgrade or conflict');
  const b=validateBundle(await read(`/timezone-rules/data/${m.version}`,4*1024*1024));
  if(b.tzdbVersion!==m.version||b.sha256!==m.digest)throw Error('rules mismatch');
  const rules=createRuleSnapshot(b);
  if(scope===own&&!controller.signal.aborted){cache=rules;for(const listener of listeners)listener();return rules;}
 }catch{/* offline, corrupt or older API: bundled baseline remains available */}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 return scope===own?latestRules():getBaseline();
}
