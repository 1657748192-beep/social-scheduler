import {createHash} from 'node:crypto';
import {validateBundle,type RuleBundle} from '@social-scheduler/timezone-rules';

export async function fetchCandidate(options:{fetch?:typeof fetch;signal?:AbortSignal}={}):Promise<{ianaVersion:string;bundle:RuleBundle|null}>{
 const request=options.fetch??fetch;
 const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000);
 async function read(url:string,limit:number){
  const res=await request(url,{redirect:'error',signal,headers:{'User-Agent':'SocialScheduler-TimezoneRules/1','Accept':'application/json,text/plain'}});
  if(!res.ok||res.status>=300||Number(res.headers.get('content-length')??0)>limit){await res.body?.cancel();throw Error('upstream-response');}
  if(!res.body)throw Error('upstream-empty');
  const reader=res.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){signal.throwIfAborted();const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>limit)throw Error('upstream-size');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  return Buffer.concat(chunks);
 }
 const ianaVersion=(await read('https://data.iana.org/time-zones/tzdb/version',256*1024)).toString('utf8').trim();
 if(!/^\d{4}[a-z]{1,2}$/.test(ianaVersion))throw Error('upstream-version');
 const tags=JSON.parse((await read('https://api.github.com/repos/moment/moment-timezone/tags?per_page=30',256*1024)).toString('utf8'));
 if(!Array.isArray(tags))throw Error('upstream-tags');
 const allowed=tags.filter((t:any)=>/^0\.\d+\.\d+$/.test(t?.name)&&/^[a-f0-9]{40}$/.test(t?.commit?.sha)).sort((a:any,b:any)=>{const x=a.name.split('.').map(Number),y=b.name.split('.').map(Number);return y[1]-x[1]||y[2]-x[2];});
 if(!allowed.length)return {ianaVersion,bundle:null};
 const source=`https://raw.githubusercontent.com/moment/moment-timezone/${allowed[0].commit.sha}/data/packed/latest.json`;
 const bytes=await read(source,4*1024*1024),data=JSON.parse(bytes.toString('utf8'));
 const bundle=validateBundle({schemaVersion:1,engineCompatibility:1,tzdbVersion:data.version,source,generatedAt:new Date().toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),sourceBytes:bytes.toString('base64'),data});
 return {ianaVersion,bundle};
}
