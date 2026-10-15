import assert from 'node:assert/strict';
import test from 'node:test';
import {request} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createLocalUploadFixture} from './helpers/localUploadFixture';
import {startLocalUploadHttp} from './helpers/localUploadHttp';
import {computeFingerprint} from '../src/uploads/local/protocol';
import {createUploadLeases} from '../src/uploads/local/leases';

async function slowSend(url:string,method:string,body:Buffer,headers:Record<string,string>,cutAfter?:number,dropResponse=false){
 return new Promise<{status:number;body:string;sent:number}>((resolve,reject)=>{
  let sent=0,settled=false;const finish=(value:{status:number;body:string;sent:number})=>{if(!settled){settled=true;resolve(value);}};
  const req=request(url,{method,headers:{...headers,'Content-Length':String(body.length)}},res=>{
   if(dropResponse){res.destroy();finish({status:0,body:'',sent});return;}
   let text='';res.on('data',b=>text+=b);res.on('end',()=>finish({status:res.statusCode!,body:text,sent}));
  });
  req.on('error',error=>{if(cutAfter!==undefined||dropResponse)finish({status:0,body:'',sent});else if(!settled){settled=true;reject(error);}});
  void(async()=>{
   const limit=cutAfter??body.length;
   while(sent<limit&&!settled){const next=Math.min(sent+65536,limit);req.write(body.subarray(sent,next));sent=next;await new Promise(resolve=>setTimeout(resolve,5));}
   if(cutAfter!==undefined)req.destroy(new Error('controlled local network interruption'));else req.end();
  })().catch(reject);
 });
}
async function idle(f:Awaited<ReturnType<typeof createLocalUploadFixture>>,id:string){
 const leases=createUploadLeases(f.redis,f.prefix),until=Date.now()+3000;
 while(await leases.active(id)){assert.ok(Date.now()<until,'receiver must release after disconnect');await new Promise(resolve=>setTimeout(resolve,10));}
}

test('interrupted video resumes into one schedulable asset without changing old bindings, scopes or schedules',async t=>{
 const f=await createLocalUploadFixture(t),http=await startLocalUploadHttp(t,f,{composer:true}),bytes=Buffer.alloc(9*1048576,37),accountId=randomUUID();
 await f.db.socialAccount.create({data:{id:accountId,workspaceId:f.actor.workspaceId,platform:'youtube',providerAccountId:`test-${accountId}`,displayName:'Local test channel',credential:{create:{accessTokenEncrypted:'test-only-never-used',refreshTokenEncrypted:'test-only-refresh',scopes:['https://www.googleapis.com/auth/youtube.upload']}}}});
 const post=await f.db.post.create({data:{workspaceId:f.actor.workspaceId,authorId:f.actor.userId,baseText:'Existing schedule',workflowStatus:'scheduled'}});
 const variant=await f.db.postVariant.create({data:{postId:post.id,socialAccountId:accountId,platform:'youtube',text:'Existing schedule',publishStatus:'queued'}});
 const baselineSchedule=await f.db.schedule.create({data:{workspaceId:f.actor.workspaceId,createdBy:f.actor.userId,postVariantId:variant.id,scheduledAt:new Date(Date.now()+7200000)}});
 const baselineAccount=await f.db.socialAccount.findUnique({where:{id:accountId},include:{credential:true}});
 const hashes=Array.from({length:9},(_,i)=>createHash('sha256').update(bytes.subarray(i*1048576,(i+1)*1048576)).digest('hex'));
 const manifest={clientKey:randomUUID(),originalName:'local-synthetic.mp4',mimeType:'video/mp4',sizeBytes:bytes.length,partHashes:hashes,fingerprint:await computeFingerprint(bytes.length,'video/mp4',hashes)};
 const initialize=()=>http.request('/upload-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(manifest)});
 const response=await initialize();assert.equal(response.status,201);const session=await response.json();
 const headers={Authorization:`Bearer ${http.token}`,'Content-Type':'application/octet-stream'};
 for(let i=0;i<3;i++)assert.equal((await slowSend(`${http.base}/upload-sessions/${session.id}/parts/${i}`,'PUT',bytes.subarray(i*1048576,(i+1)*1048576),headers)).status,200);
 // The real API confirms block 3, but the client deliberately loses its ACK.
 assert.equal((await slowSend(`${http.base}/upload-sessions/${session.id}/parts/3`,'PUT',bytes.subarray(3*1048576,4*1048576),headers,undefined,true)).status,0);
 await slowSend(`${http.base}/upload-sessions/${session.id}/parts/4`,'PUT',bytes.subarray(4*1048576,5*1048576),headers,524288);
 await idle(f,session.id);
 assert.equal((await(await initialize()).json()).id,session.id);
 const recovered=await(await http.request(`/upload-sessions/${session.id}`)).json();assert.deepEqual(recovered.receivedParts,[0,1,2,3]);
 const start=performance.now();let retryBytes=0;
 for(let i=4;i<9;i++){const part=bytes.subarray(i*1048576,(i+1)*1048576);retryBytes+=part.length;assert.equal((await slowSend(`${http.base}/upload-sessions/${session.id}/parts/${i}`,'PUT',part,headers)).status,200);}
 const completed=await http.request(`/upload-sessions/${session.id}/complete`,{method:'POST'});assert.equal(completed.status,200);const asset=await completed.json();
 assert.equal((await(await http.request(`/upload-sessions/${session.id}/complete`,{method:'POST'})).json()).id,asset.id);
 assert.equal(await f.db.mediaAsset.count({where:{workspaceId:f.actor.workspaceId,status:'ready'}}),1);
 assert.equal(createHash('sha256').update(await readFile(path.join(f.root,asset.storageKey))).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
 const content={baseText:'Local upload verification',variants:[{socialAccountId:accountId,platform:'youtube',text:'Local upload verification',mediaAssetIds:[asset.id],platformPayload:{}}]};
 const draft=await fetch(http.base.replace(/\/media$/,'/composer/posts'),{method:'POST',headers:{Authorization:`Bearer ${http.token}`,'Content-Type':'application/json'},body:JSON.stringify(content)});
 assert.equal(draft.status,201);const saved=await draft.json();assert.equal(saved.variants[0].media[0].mediaAsset.originalAvailable,true);
 const scheduled=await fetch(http.base.replace(/\/media$/,'/composer/posts'),{method:'POST',headers:{Authorization:`Bearer ${http.token}`,'Content-Type':'application/json'},body:JSON.stringify({...content,scheduledAt:new Date(Date.now()+3600000).toISOString()})});
 assert.equal(scheduled.status,201);
 const schedules=await fetch(http.base.replace(/\/media$/,'/schedules'),{headers:{Authorization:`Bearer ${http.token}`}});assert.equal(schedules.status,200);
 assert.ok((await schedules.json()).some((s:any)=>s.postVariant.media.some((m:any)=>m.mediaAsset.id===asset.id)));
 assert.deepEqual(await f.db.schedule.findUnique({where:{id:baselineSchedule.id}}),baselineSchedule);
 assert.deepEqual(await f.db.socialAccount.findUnique({where:{id:accountId},include:{credential:true}}),baselineAccount);
 assert.ok((await f.redis.keys(`${f.prefix}:publish:*`)).length>0,'future publish job must use only the random test Redis prefix');
 t.diagnostic(`CHUNK_METRICS confirmedBeforeRecovery=4194304 retryVideoBytes=${retryBytes} partialLostVideoBytes=524288 recoveryMs=${Math.round(performance.now()-start)}`);
});

test('a locally throttled interrupted legacy upload must resend the whole video',async t=>{
 const f=await createLocalUploadFixture(t),http=await startLocalUploadHttp(t,f,{composer:true}),bytes=Buffer.alloc(9*1048576,37),boundary='local-upload-benchmark';
 const prefix=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="legacy.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),suffix=Buffer.from(`\r\n--${boundary}--\r\n`),body=Buffer.concat([prefix,bytes,suffix]);
 const headers={Authorization:`Bearer ${http.token}`,'Content-Type':`multipart/form-data; boundary=${boundary}`};
 await slowSend(http.base,'POST',body,headers,prefix.length+4718592);
 assert.equal(await f.db.mediaAsset.count({where:{workspaceId:f.actor.workspaceId}}),0);
 const start=performance.now(),retry=await slowSend(http.base,'POST',body,headers);assert.equal(retry.status,201);
 const asset=JSON.parse(retry.body);assert.deepEqual(await readFile(path.join(f.root,asset.storageKey)),bytes);
 t.diagnostic(`LEGACY_METRICS confirmedBeforeRecovery=0 retryVideoBytes=${bytes.length} partialLostVideoBytes=4718592 recoveryMs=${Math.round(performance.now()-start)}`);
});
