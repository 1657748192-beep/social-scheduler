import {request,createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import type {TestContext} from 'node:test';

export async function createUploadHttpFixture(t:TestContext){
 const sessions=new Map<string,any>(),intents=new Map<string,string>(),storage=new Map<string,string>();
 const controls={loseAck:false,status:0,failIndex:0,retryAfter:'',active:0,maxActive:0,puts:0,gets:0,completes:0,completeBusy:0,assemblyPollsRemaining:2,ackDelayIndex:-1,getStatus:0,capStatus:200,legacyPuts:0,holdComplete:false,cancels:0,completedAssetExpired:false};
 const completeWaiters:Array<()=>void>=[];const releaseCompletes=()=>{controls.holdComplete=false;for(const release of completeWaiters.splice(0))release();};
 const server=createServer(async(req,res)=>{
  const route=new URL(req.url!,'http://test').pathname;const json=(status:number,body:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  const chunks:Buffer[]=[];for await(const b of req)chunks.push(Buffer.from(b));const bytes=Buffer.concat(chunks);
  if(route.endsWith('/upload-capabilities')){json(controls.capStatus,controls.capStatus===200?{protocol:'local-chunks-v1',ownerUserId:'11111111-1111-4111-8111-111111111111',partSizeBytes:1048576,thresholdBytes:8388608,maxFileBytes:262144000}:{});return;}
  if(req.method==='POST'&&route.endsWith('/media')){controls.legacyPuts++;json(201,{id:randomUUID(),workspaceId:'w',fileUrl:'https://example.test/original',storageKey:'original',mimeType:req.headers['x-test-mime']??'video/mp4',sizeBytes:bytes.length,createdAt:new Date().toISOString()});return;}
  if(req.method==='POST'&&route.endsWith('/upload-sessions')){
   const m=JSON.parse(bytes.toString()),key=`${req.headers.authorization}:${route}:${m.clientKey}`;
   let id=intents.get(key);if(!id){id=randomUUID();intents.set(key,id);sessions.set(id,{id,state:'receiving',totalBytes:m.sizeBytes,partSizeBytes:1048576,receivedParts:[],expiresAt:new Date(Date.now()+86400000).toISOString(),assetId:null,manifest:m,parts:new Map(),writes:new Map(),attempts:new Map()});}
   json(201,sessions.get(id));return;
  }
  const match=route.match(/\/upload-sessions\/([^/]+)(?:\/(parts\/([0-9]+)|complete|thumbnail))?$/),s=match?sessions.get(match[1]):null;
  if(!s){json(404,{});return;}
  if(req.method==='GET'){controls.gets++;if(controls.getStatus){json(controls.getStatus,{});return;}if(s.state==='assembling'&&controls.assemblyPollsRemaining--<=0)s.state='completed';json(200,s);return;}
  if(req.method==='PUT'&&match![3]!==undefined){
   const index=Number(match![3]);s.attempts.set(index,(s.attempts.get(index)??0)+1);controls.puts++;controls.active++;controls.maxActive=Math.max(controls.maxActive,controls.active);
   if(s.state==='completed'){controls.active--;json(409,{details:{code:'completed'}});return;}
   await new Promise(resolve=>setTimeout(resolve,10));controls.active--;
   if(controls.status&&index===controls.failIndex){if(controls.retryAfter)res.setHeader('Retry-After',controls.retryAfter);json(controls.status,{message:'controlled upload error',details:{code:controls.status===409?'part_conflict':'controlled'}});return;}
   s.parts.set(index,bytes);s.writes.set(index,(s.writes.get(index)??0)+1);if(!s.receivedParts.includes(index))s.receivedParts.push(index);
   if(index===controls.ackDelayIndex)await new Promise(resolve=>setTimeout(resolve,80));
   if(controls.loseAck){controls.loseAck=false;res.destroy();return;}
   json(200,s);return;
  }
  if(req.method==='POST'&&route.endsWith('/complete')){
   if(controls.holdComplete)await new Promise<void>(resolve=>completeWaiters.push(resolve));
   controls.completes++;if(controls.completeBusy-->0||s.state==='assembling'){s.state='assembling';res.setHeader('Retry-After','0');json(409,{details:{code:'assembling'}});return;}
   if(controls.completedAssetExpired){json(410,{details:{code:'asset_expired'}});return;}
   s.state='completed';s.assetId=s.assetId??randomUUID();json(200,{id:s.assetId,workspaceId:'w',fileUrl:'https://example.test/video.mp4',storageKey:'video.mp4',mimeType:s.manifest.mimeType,sizeBytes:s.totalBytes,createdAt:new Date().toISOString(),originalAvailable:true});return;
  }
  if(req.method==='DELETE'){controls.cancels++;s.state=s.state==='completed'?'completed':'cancelled';json(200,{state:s.state,cleanupPending:false});return;}
  json(200,{});
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as any).port;
 const oldXHR=Object.getOwnPropertyDescriptor(globalThis,'XMLHttpRequest'),oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 class TestXHR{
  timeout=0;status=0;responseText='';upload:any={};onload:any;onerror:any;onabort:any;ontimeout:any;
  method='';url='';headers:Record<string,string>={};responseHeaders:any={};req:any;aborted=false;
  open(method:string,url:string){this.method=method;this.url=url;}
  setRequestHeader(k:string,v:string){this.headers[k]=v;}
  getResponseHeader(k:string){return this.responseHeaders[k.toLowerCase()]??null;}
  async send(value?:Blob|string|FormData|null){
   if(value instanceof FormData){const file=value.get('file') as File;this.headers['x-test-mime']=file.type;value=file;}
   const bytes=value instanceof Blob?Buffer.from(await value.arrayBuffer()):Buffer.from(value??'');if(this.aborted)return;
   this.req=request({host:'127.0.0.1',port,path:new URL(this.url).pathname,method:this.method,headers:{...this.headers,'Content-Length':bytes.length}},res=>{
    this.status=res.statusCode!;this.responseHeaders=res.headers;const chunks:Buffer[]=[];
    res.on('data',b=>chunks.push(b));res.on('aborted',()=>this.onerror?.());res.on('end',()=>{this.responseText=Buffer.concat(chunks).toString();this.onload?.();});
   });
   this.req.on('error',()=>{if(!this.aborted)this.onerror?.();});this.req.setTimeout(this.timeout,()=>{this.ontimeout?.();this.req.destroy();});
   this.req.end(bytes);this.upload.onprogress?.({lengthComputable:true,loaded:bytes.length,total:bytes.length});
  }
  abort(){this.aborted=true;this.req?.destroy();this.onabort?.();}
 }
 Object.defineProperty(globalThis,'XMLHttpRequest',{configurable:true,value:TestXHR});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}});
 t.after(()=>{
  if(oldXHR)Object.defineProperty(globalThis,'XMLHttpRequest',oldXHR);else delete(globalThis as any).XMLHttpRequest;
  if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete(globalThis as any).localStorage;
  releaseCompletes();server.closeAllConnections();server.close();
 });
 return {sessions,storage,controls,releaseCompletes};
}
