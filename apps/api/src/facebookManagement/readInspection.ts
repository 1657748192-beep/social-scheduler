import {AsyncLocalStorage} from 'node:async_hooks';
import {FacebookDirectoryError} from './graphDirectory';
import type {PageTokenInspection} from './types';

type Scope=Map<symbol,Map<string,Promise<PageTokenInspection>>>;
const readScope=new AsyncLocalStorage<Scope>();
/** Evidence belongs to one read operation, never to a later request or send. */
export function withFacebookReadInspection<T>(run:()=>Promise<T>):Promise<T>{
 return readScope.getStore()?run():readScope.run(new Map(),run);
}
export function createFacebookReadInspectionGuard({now=Date.now}:{now?:()=>number}={}){
 const namespace=Symbol('facebook-inspection');let blockedUntil=0,failures=0,generation=0;
 function recordLimit(seconds=60){generation++;failures=Math.min(failures+1,4);const delay=Math.max(Math.min(3600,Math.max(1,seconds)),Math.min(300,60*2**(failures-1)));blockedUntil=Math.max(blockedUntil,now()+delay*1000);return new FacebookDirectoryError('rate_limited',Math.ceil((blockedUntil-now())/1000));}
 const inspectRead=async(key:string,inspect:()=>Promise<PageTokenInspection>,options:{fresh?:boolean}={}):Promise<PageTokenInspection>=>{
  if(now()<blockedUntil)throw new FacebookDirectoryError('rate_limited',Math.ceil((blockedUntil-now())/1000));
  const cacheKey=generation+':'+key;
  if(options.fresh)readScope.getStore()?.get(namespace)?.delete(cacheKey);
  const scope=options.fresh?undefined:readScope.getStore();
  let cache=scope?.get(namespace);if(scope&&!cache){cache=new Map();scope.set(namespace,cache);}
  const existing=cache?.get(cacheKey);if(existing)return structuredClone(await existing);
  const started=now();
  const request=Promise.resolve().then(inspect).then(value=>{
   if(started>=blockedUntil)failures=0;
   return value;
  },error=>{
   if(error instanceof FacebookDirectoryError&&error.kind==='rate_limited'){
    throw recordLimit(error.retryAfterSeconds);
   }throw error;
  });
  if(cache&&cache.size<256)cache.set(cacheKey,request);
  try{return structuredClone(await request);}catch(error){if(cache?.get(cacheKey)===request)cache.delete(cacheKey);throw error;}
 };
 return Object.assign(inspectRead,{rateLimited:(seconds?:number)=>{recordLimit(seconds);}});
}
