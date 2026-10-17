import type Redis from 'ioredis';
import {randomBytes} from 'node:crypto';
import {HttpError} from '../utils/errors';
import type {PageCandidate,StoredSync,SyncContext,SyncResult,VerifiedPage} from './types';
const prefix='facebook-page-sync:v1:';
const idPattern=/^[A-Za-z0-9_-]{43}$/;
export const isPageSyncState=(state:string)=>/^fbps_[A-Za-z0-9_-]{43}$/.test(state);
export const isPageSyncNamespace=(state:string)=>state.startsWith('fbps_');
const owner=(ctx:SyncContext)=>`${ctx.userId}:${ctx.sessionId}:${ctx.workspaceId}`;
const unavailable=()=>new HttpError(503,'Page sync temporarily unavailable',{code:'sync_unavailable'});
type Envelope=Omit<StoredSync,'pages'|'rejected'|'status'>&{owner:string;secret?:string;status:StoredSync['status']|'canceling'};
export function createFacebookPageSyncStore(deps:{redis:Redis;encrypt:(value:string)=>string;decrypt:(value:string)=>string}){
 const {redis,encrypt,decrypt}=deps;
 const key=(id:string)=>{if(!idPattern.test(id))throw new HttpError(400,'Invalid sync identifier');return prefix+'sync:'+id;};
 async function guard<T>(work:()=>Promise<T>){try{return await work();}catch(e){if(e instanceof HttpError)throw e;throw unavailable();}}
 async function envelope(ctx:SyncContext,id:string):Promise<Envelope|null>{return guard(async()=>{const raw=await redis.get(key(id));if(!raw)return null;const record=JSON.parse(raw) as Envelope;if(record.owner!==owner(ctx))throw new HttpError(403,'Page sync access denied');if(record.expiresAt<=Date.now()||record.status==='canceling')return null;return record;});}
 const cas=`local raw=redis.call('GET',KEYS[1]);if not raw then return 'missing' end;local r=cjson.decode(raw);if r.owner~=ARGV[1] then return 'forbidden' end;if r.expiresAt<=tonumber(ARGV[2]) then return 'missing' end;
 local mode=ARGV[3];if mode=='confirm' then
  if r.status=='canceling' then return 'conflict' end;
  if r.selectionHash and r.selectionHash~=ARGV[4] then return 'conflict' end;
  if r.status=='completed' then return 'completed' end;
  r.status='importing';r.selectionHash=ARGV[4];r.leaseId=r.leaseId or ARGV[5];redis.call('SET',KEYS[1],cjson.encode(r),'KEEPTTL');return r.leaseId;
 elseif mode=='cancel' then
  if r.status~='ready' then return 'conflict' end;r.status='canceling';r.leaseId=ARGV[5];r.secret=nil;redis.call('SET',KEYS[1],cjson.encode(r),'KEEPTTL');return r.leaseId;
 elseif mode=='finish' then
  if r.status=='completed' and r.leaseId==ARGV[5] then return 'ok' end;
  if r.status~='importing' or r.leaseId~=ARGV[5] then return 'conflict' end;r.status='completed';r.secret=nil;r.result=cjson.decode(ARGV[4]);redis.call('SET',KEYS[1],cjson.encode(r),'KEEPTTL');return 'ok';
 elseif mode=='delete' then
  if r.status~='canceling' or r.leaseId~=ARGV[5] then return 'conflict' end;redis.call('DEL',KEYS[1]);return 'ok';end;return 'conflict'`;
 async function change(ctx:SyncContext,id:string,mode:string,value:string,lease:string){return guard(async()=>{const result=String(await redis.eval(cas,1,key(id),owner(ctx),String(Date.now()),mode,value,lease));if(result==='forbidden')throw new HttpError(403,'Page sync access denied');if(result==='missing')throw new HttpError(410,'Page sync expired');if(result==='conflict')throw new HttpError(409,'Page sync operation is already accepted or changed');return result;});}
 return{
  async createState(ctx:SyncContext,state:string){if(!isPageSyncState(state))throw new HttpError(400,'Invalid sync state');await guard(async()=>{if(await redis.set(prefix+'state:'+state,JSON.stringify({context:ctx,expiresAt:Date.now()+600000}),'EX',600,'NX')!=='OK')throw unavailable();});},
  async consumeState(state:string):Promise<SyncContext|null>{if(!isPageSyncState(state))return null;return guard(async()=>{const raw=await redis.eval("local v=redis.call('GET',KEYS[1]);if v then redis.call('DEL',KEYS[1]) end;return v",1,prefix+'state:'+state);if(typeof raw!=='string')return null;const data=JSON.parse(raw);return data.expiresAt>Date.now()?data.context:null;});},
  async saveCandidates(ctx:SyncContext,id:string,input:{pages:VerifiedPage[];rejected:PageCandidate[]}){await guard(async()=>{const serialized=JSON.stringify(input);if(Buffer.byteLength(serialized)>4*1024*1024||input.pages.length+input.rejected.length>2000)throw new HttpError(400,'Page sync directory too large');const record:Envelope={context:ctx,owner:owner(ctx),syncId:id,expiresAt:Date.now()+900000,status:'ready',secret:encrypt(serialized)};if(await redis.set(key(id),JSON.stringify(record),'PX',900000,'NX')!=='OK')throw unavailable();});},
  async read(ctx:SyncContext,id:string):Promise<StoredSync|null>{const record=await envelope(ctx,id);if(!record)return null;return guard(async()=>{const data=record.secret?JSON.parse(decrypt(record.secret)):{pages:[],rejected:[]};if(!Array.isArray(data.pages)||!Array.isArray(data.rejected))throw unavailable();const pages:VerifiedPage[]=data.pages.map((p:any)=>{const expiresAt=p.expiresAt===null?null:new Date(p.expiresAt);if(expiresAt&&!Number.isFinite(expiresAt.getTime()))throw unavailable();return{...p,expiresAt};});return{context:record.context,syncId:id,expiresAt:record.expiresAt,status:record.status as StoredSync['status'],pages,rejected:data.rejected,selectionHash:record.selectionHash,leaseId:record.leaseId,result:record.result};});},
  async claim(ctx:SyncContext,id:string,operation:'confirm'|'cancel',selectionHash=''){const leaseId=await change(ctx,id,operation,selectionHash,randomBytes(24).toString('base64url'));return{leaseId};},
  async finish(ctx:SyncContext,id:string,leaseId:string,result:SyncResult){await change(ctx,id,'finish',JSON.stringify(result),leaseId);},
  async cancel(ctx:SyncContext,id:string,leaseId:string){await change(ctx,id,'delete','',leaseId);}
 };
}
