import type {MediaAsset} from './api';
import {localUploadRequest,UploadHttpError} from './localUploadTransport';
import {localUploadQueue} from './localUploadQueue';
import {PART_SIZE_BYTES,MAX_FILE_BYTES,computeFingerprint,type UploadView} from './localUploadProtocol';

export type LocalUploadProgress={phase:'preparing'|'uploading'|'finalizing';confirmedBytes:number;totalBytes:number;speedBytesPerSecond:number|null;remainingSeconds:number|null;inflightBytes:number;canResumeAfterReload:boolean;sessionId?:string};
type Pending={clientKey:string;sessionId?:string;notBeforeMs?:number};
const pending=new Map<string,Pending>();
export function forgetLocalUploadSession(userId:string,workspaceId:string,sessionId:string){
 const prefix=`local-upload:v1:${userId}:${workspaceId}:`;
 for(const [key,record] of pending)if(key.startsWith(prefix)&&record.sessionId===sessionId){pending.delete(key);try{localStorage.removeItem(key);}catch{}}
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function wait(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{signal.throwIfAborted();const done=()=>{signal.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);reject(new DOMException('Upload cancelled','AbortError'));};signal.addEventListener('abort',abort,{once:true});});}
function retryable(e:unknown){return e instanceof UploadHttpError&&(e.status===0||[408,429,500,502,503,504].includes(e.status)||(e.status===409&&['part_busy','assembling'].includes(e.code??'')));}
export async function uploadLocalVideo(input:{file:File;workspaceId:string;userId:string;token:string;signal:AbortSignal;onProgress:(p:LocalUploadProgress)=>void;thumbnail?:Promise<Blob|null>}):Promise<MediaAsset>{
 const optionalThumbnail=input.thumbnail?.catch(()=>null);
 const {file,workspaceId,userId,token}=input;
 if(!uuid.test(workspaceId)||!uuid.test(userId)||file.size<1||file.size>MAX_FILE_BYTES||!/^video\//.test(file.type))throw new UploadHttpError('Invalid video or workspace',400,'invalid_file');
 if(!globalThis.crypto?.subtle||typeof file.slice(0,1).arrayBuffer!=='function')throw new UploadHttpError('This browser cannot read video chunks. Please use a current browser.',400,'browser_unsupported');
 const controller=new AbortController(),abort=()=>controller.abort(input.signal.reason);input.signal.addEventListener('abort',abort,{once:true});if(input.signal.aborted)abort();
 const signal=controller.signal,base=`/workspaces/${workspaceId}/media`,started=performance.now();
 const confirmed=new Set<number>(),inflight=new Map<number,number>();let canResumeAfterReload=true,sessionId:string|undefined,baseline=0;
 let key='',record:Pending|undefined;
 const report=(phase:LocalUploadProgress['phase'])=>{
  let confirmedBytes=0;for(const index of confirmed)confirmedBytes+=Math.min(PART_SIZE_BYTES,file.size-index*PART_SIZE_BYTES);
  const elapsed=(performance.now()-started)/1000,delta=confirmedBytes-baseline,speed=elapsed>0&&delta>0?delta/elapsed:null;
  input.onProgress({phase,confirmedBytes,totalBytes:file.size,inflightBytes:[...inflight.entries()].filter(([index])=>!confirmed.has(index)).reduce((sum,[,bytes])=>sum+bytes,0),speedBytesPerSecond:speed,remainingSeconds:speed?(file.size-confirmedBytes)/speed:null,canResumeAfterReload,sessionId});
 };
 const save=()=>{if(!record)return;pending.set(key,record);try{localStorage.setItem(key,JSON.stringify(record));}catch{canResumeAfterReload=false;}};
 const forget=()=>{pending.delete(key);try{localStorage.removeItem(key);}catch{}};
 const request=<T>(suffix:string,method='GET',body?:unknown,bytes?:Blob,onProgress?:(bytes:number)=>void)=>localUploadRequest<T>(base+suffix,token,{method,body,bytes,signal,timeoutMs:suffix.endsWith('/complete')?120000:bytes?240000:30000,onProgress});
 const pause=(e:UploadHttpError)=>{if((e.retryAfterMs??0)>60000){record!.notBeforeMs=Date.now()+e.retryAfterMs!;save();throw new UploadHttpError('Upload paused until the server retry time',429,'retry_paused',e.retryAfterMs);}};
 const readStatus=async()=>{
  const view=await request<UploadView>(`/upload-sessions/${sessionId}`);
  if(view.id!==sessionId||view.totalBytes!==file.size||view.partSizeBytes!==PART_SIZE_BYTES||!Array.isArray(view.receivedParts)||view.receivedParts.some(i=>!Number.isInteger(i)||i<0||i>=Math.ceil(file.size/PART_SIZE_BYTES)))throw new UploadHttpError('Invalid upload status',400,'invalid_status');
  if(['cancelled','expired'].includes(view.state))throw new UploadHttpError('This upload expired; please start again',410,'upload_expired');
  for(const index of view.receivedParts)confirmed.add(index);return view;
 };
 try{
  report('preparing');const hashes:string[]=[];
  for(let offset=0;offset<file.size;offset+=PART_SIZE_BYTES){signal.throwIfAborted();const hash=await crypto.subtle.digest('SHA-256',await file.slice(offset,offset+PART_SIZE_BYTES).arrayBuffer());hashes.push(Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''));}
  const fingerprint=await computeFingerprint(file.size,file.type,hashes);key=`local-upload:v1:${userId}:${workspaceId}:${fingerprint}`;
  try{
   const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw);if(uuid.test(p.clientKey)&&(!p.sessionId||uuid.test(p.sessionId))&&(p.notBeforeMs===undefined||Number.isFinite(p.notBeforeMs)))record=p;else localStorage.removeItem(key);}
  }catch{canResumeAfterReload=false;}
  record??=pending.get(key)??{clientKey:crypto.randomUUID()};save();signal.throwIfAborted();
  if(record.notBeforeMs&&record.notBeforeMs>Date.now())throw new UploadHttpError('Upload paused until the server retry time',429,'retry_paused',record.notBeforeMs-Date.now());
  // The saved UUID is a hint, never proof of content identity. Revalidate the
  // full manifest under its idempotency key before trusting a cached session.
  const view=await request<UploadView>('/upload-sessions','POST',{clientKey:record.clientKey,originalName:file.name,mimeType:file.type,sizeBytes:file.size,partHashes:hashes,fingerprint});
  if(!uuid.test(view.id))throw new UploadHttpError('Invalid upload session',400,'invalid_status');
  sessionId=view.id;record.sessionId=sessionId;save();const resumed=await readStatus();
  // Completed sessions no longer have part rows. Revalidate the asset through
  // complete rather than trying to upload the already-consumed blocks again.
  const alreadyCompleted=resumed.state==='completed';
  if(alreadyCompleted)for(let i=0;i<hashes.length;i++)confirmed.add(i);
  for(const i of confirmed)baseline+=Math.min(PART_SIZE_BYTES,file.size-i*PART_SIZE_BYTES);
  report('uploading');
  const send=async(index:number)=>{
   if(confirmed.has(index))return;
   const bytes=file.slice(index*PART_SIZE_BYTES,Math.min(file.size,(index+1)*PART_SIZE_BYTES));
   for(let attempt=0;attempt<4;attempt++){
    signal.throwIfAborted();
    try{
     await request<UploadView>(`/upload-sessions/${sessionId}/parts/${index}`,'PUT',undefined,bytes,loaded=>{inflight.set(index,Math.min(bytes.size,loaded));report('uploading');});
     confirmed.add(index);return;
    }catch(e){
     if(!retryable(e))throw e;const error=e as UploadHttpError;pause(error);
     try{await readStatus();}catch(statusError){if(!retryable(statusError))throw statusError;}
     if(confirmed.has(index))return;
     if(error.status===409&&['part_busy','assembling'].includes(error.code??'')){
      for(let poll=0;poll<3;poll++){await wait(Math.max(1000*2**poll+Math.random()*250,error.retryAfterMs??0),signal);await readStatus();if(confirmed.has(index))return;}
      throw error;
     }
     if(attempt===3)throw e;
     await wait(Math.max(1000*2**attempt+Math.random()*250,error.retryAfterMs??0),signal);
    }finally{inflight.delete(index);report('uploading');}
   }
  };
  const jobs=hashes.map((_,i)=>confirmed.has(i)?Promise.resolve():localUploadQueue.run(()=>send(i),signal));
  try{await Promise.all(jobs);}catch(e){controller.abort();await Promise.allSettled(jobs);throw e;}
  report('finalizing');
  if(optionalThumbnail&&!alreadyCompleted){
   // A caller is expected to bound generation; keep this boundary bounded too.
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{const thumbnail=await Promise.race([optionalThumbnail,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),5000);})]);if(thumbnail&&thumbnail.size<=102400)await request(`/upload-sessions/${sessionId}/thumbnail`,'PUT',undefined,thumbnail);}
   catch{/* Optional cover failure never invalidates a verified video. */}finally{if(timer)clearTimeout(timer);}
  }
  for(let attempt=0;attempt<4;attempt++){
   signal.throwIfAborted();
   try{const asset=await request<MediaAsset>(`/upload-sessions/${sessionId}/complete`,'POST');if(!asset?.id||asset.originalAvailable===false)throw new UploadHttpError('Completed media unavailable',410,'asset_expired');forget();return asset;}
   catch(e){
    if(!retryable(e))throw e;const error=e as UploadHttpError;pause(error);let view=await readStatus();
    if(error.code==='assembling'){
     for(let poll=0;view.state==='assembling'&&poll<5;poll++){await wait(Math.max(1000*2**poll+Math.random()*250,error.retryAfterMs??0),signal);view=await readStatus();}
     if(view.state==='assembling')throw error;
    }else await wait(Math.max(1000*2**attempt+Math.random()*250,error.retryAfterMs??0),signal);
    if(attempt===3)throw e;
   }
  }
  throw new Error('Upload confirmation failed');
 }catch(e){if(e instanceof UploadHttpError&&(e.status===410||e.code==='manifest_conflict'))forget();throw e;}
 finally{input.signal.removeEventListener('abort',abort);}
}
