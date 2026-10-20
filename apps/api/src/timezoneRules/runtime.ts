import IORedis from 'ioredis';
import {baselineBundle,createRuleSnapshot,type RuleBundle} from '@social-scheduler/timezone-rules';
import {config} from '../config';
import {createRuleStore} from './store';
import {checkRulesOnce,type RuleStore,type RuleStatus} from './updater';
import {fetchCandidate} from './source';
type Store=RuleStore & {readVersion(version:string):Promise<RuleBundle|null>};
let activeIds=createRuleSnapshot(baselineBundle);
export function knownRuleZone(id:string){return activeIds.canonicalZone(id)!==null;}
export function createRulesRuntime({store,source,close=async()=>{}}:{store:Store;source:(signal:AbortSignal)=>Promise<{ianaVersion:string;bundle:RuleBundle|null}>;close?:()=>Promise<void>}){
 let timer:ReturnType<typeof setTimeout>|undefined,running:Promise<void>|undefined,controller:AbortController|undefined,started=false,stopped=false,retries=0;
 let cached:RuleBundle=baselineBundle,lastRead=0;
 async function getBundle(version?:string,force=false):Promise<RuleBundle>{
  if(version===baselineBundle.tzdbVersion)return baselineBundle;
  if(version){const b=await store.readVersion(version);if(!b)throw Error('rules-not-found');return b;}
  if(!force&&Date.now()-lastRead<60000)return cached;
  try{const b=await store.readActive();if(b){activeIds=createRuleSnapshot(b);cached=b;}else{cached=baselineBundle;activeIds=createRuleSnapshot(baselineBundle);}lastRead=Date.now();}catch{/* cached or bundled data remains usable */}
  return cached;
 }
 function schedule(ms:number){if(!stopped){timer=setTimeout(run,ms);timer.unref?.();}}
 function run(){
  controller=new AbortController();
  running=(async()=>{
   let status:RuleStatus;
   try{status=await checkRulesOnce({store,source:()=>source(controller!.signal),signal:controller!.signal});lastRead=0;await getBundle();}
   catch{status={activeVersion:cached.tzdbVersion,state:'failed'};}
   if(status.state==='failed'&&retries<2)schedule([5*60000,30*60000][retries++]);else{retries=0;schedule(24*3600000);}
  })();
 }
 return {getBundle,refreshBundle:()=>getBundle(undefined,true),getStatus:()=>store.status(),start(){if(!started&&!stopped){started=true;run();}},async stop(){stopped=true;clearTimeout(timer);controller?.abort();await running;await close();}};
}
export type RulesRuntime=ReturnType<typeof createRulesRuntime>;
let refreshing:Promise<unknown>|undefined;
export async function refreshUnknownRuleZone(value:unknown,runtime?:RulesRuntime){
 if(typeof value!=='string'||value.length>80||!/^\w+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value)||knownRuleZone(value))return;
 // Coalesce unknown-ID checks; refresh only verified cache data, never fetch upstream on a write request.
 refreshing??=(runtime??getRulesRuntime()).refreshBundle().finally(()=>{refreshing=undefined;});
 await refreshing;
}
let defaultRuntime:RulesRuntime|undefined;
export function getRulesRuntime():RulesRuntime{
 if(!defaultRuntime){
  // Bounded independent connection: timezone cache must not inherit publishing Redis's infinite retries.
  const client=new IORedis(config.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:1000,commandTimeout:1000,retryStrategy:()=>null});
  client.on('error',()=>undefined);
  defaultRuntime=createRulesRuntime({store:createRuleStore(client),source:signal=>fetchCandidate({signal}),close:async()=>{client.disconnect();}});
 }
 return defaultRuntime;
}
