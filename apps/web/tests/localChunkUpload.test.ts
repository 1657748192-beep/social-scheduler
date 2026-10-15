import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createUploadHttpFixture} from './helpers/localUploadHttpTransport';

function input(file=new File([Buffer.alloc(2097153,71)],'video.mp4',{type:'video/mp4'})){return {file,userId:randomUUID(),workspaceId:randomUUID(),token:'fixture-token-not-for-storage',signal:new AbortController().signal,onProgress:(_p:any)=>{}};}

test('a lost HTTP acknowledgement is queried and accepted bytes are not resent',async t=>{
 const f=await createUploadHttpFixture(t);f.controls.loseAck=true;f.controls.ackDelayIndex=1;
 const {uploadLocalVideo}=await import('../lib/localChunkUpload');const p:any[]=[];const args=input();args.onProgress=value=>p.push(value);
 const asset=await uploadLocalVideo(args),s=[...f.sessions.values()][0];
 assert.ok(asset.id);assert.equal(s.writes.get(0),1);assert.ok(f.controls.gets>0);assert.ok(f.controls.maxActive<=2);
 assert.deepEqual(Buffer.concat([0,1,2].map(i=>s.parts.get(i))),Buffer.alloc(2097153,71));
 assert.equal(p.at(-1).confirmedBytes,2097153);assert.ok(p.every(v=>v.confirmedBytes<=2097153));
 assert.ok(p.every(v=>v.confirmedBytes+v.inflightBytes<=2097153),'status confirmation must not double-count an unacknowledged in-flight block');
 assert.equal(f.storage.size,0);
});

test('401 stops immediately and follows the existing login-expiry redirect',async t=>{
 const f=await createUploadHttpFixture(t);f.controls.status=401;let redirect='';
 const before=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage,location:{pathname:'/composer',assign:(url:string)=>{redirect=url;}}}});
 t.after(()=>{if(before)Object.defineProperty(globalThis,'window',before);else delete(globalThis as any).window;});
 const {uploadLocalVideo}=await import('../lib/localChunkUpload');
 await assert.rejects(uploadLocalVideo(input(new File(['v'],'v.mp4',{type:'video/mp4'}))),{status:401});
 assert.equal(f.controls.puts,1);assert.equal(redirect,'/login?reason=session-expired');
});

test('reselecting resumes only missing blocks and different content or user never reuses its intent',async t=>{
 const f=await createUploadHttpFixture(t);f.controls.status=403;f.controls.failIndex=1;
 const {uploadLocalVideo}=await import('../lib/localChunkUpload'),args=input();
 await assert.rejects(uploadLocalVideo(args),{status:403});
 const original=[...f.sessions.values()][0];assert.ok(original.receivedParts.includes(0));
 assert.ok([...f.storage.values()].every(v=>!v.includes(args.token)));
 f.controls.status=0;await uploadLocalVideo(args);assert.equal(original.writes.get(0),1);assert.equal(f.sessions.size,1);
 await uploadLocalVideo({...args,file:new File([Buffer.alloc(2097153,72)],'video.mp4',{type:'video/mp4'})});
 await uploadLocalVideo({...args,userId:randomUUID()});assert.equal(f.sessions.size,3);
});

test('server errors retry at most three times after the initial send',async t=>{
 const f=await createUploadHttpFixture(t);f.controls.status=503;
 const {uploadLocalVideo}=await import('../lib/localChunkUpload');
 await assert.rejects(uploadLocalVideo(input(new File(['v'],'v.mp4',{type:'video/mp4'}))),{status:503});
 assert.equal(f.controls.puts,4);assert.equal(f.controls.completes,0);
});

test('long Retry-After pauses automatic and early manual retries without extra network sends',async t=>{
 const f=await createUploadHttpFixture(t);f.controls.status=429;f.controls.retryAfter='120';
 const {uploadLocalVideo}=await import('../lib/localChunkUpload'),args=input();
 await assert.rejects(uploadLocalVideo(args),{status:429});const puts=f.controls.puts;
 await assert.rejects(uploadLocalVideo(args),{status:429});assert.equal(f.controls.puts,puts);
});

test('forbidden, oversized and conflicting content are never automatically resent',async t=>{
 const f=await createUploadHttpFixture(t),{uploadLocalVideo}=await import('../lib/localChunkUpload');
 for(const status of [403,413,409]){f.controls.status=status;const before=f.controls.puts;await assert.rejects(uploadLocalVideo(input(new File(['v'],'v.mp4',{type:'video/mp4'}))),{status});assert.equal(f.controls.puts-before,1);}
});

test('unavailable browser storage still uploads with an explicit refresh-resume warning',async t=>{
 const f=await createUploadHttpFixture(t);Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('blocked');}});
 const {uploadLocalVideo}=await import('../lib/localChunkUpload');const args=input(),progress:any[]=[];args.onProgress=p=>progress.push(p);
 assert.ok((await uploadLocalVideo(args)).id);assert.ok(progress.some(p=>p.canResumeAfterReload===false));
});

test('assembling status is polled rather than repeatedly submitting complete',async t=>{
 const f=await createUploadHttpFixture(t);f.controls.completeBusy=1;
 const {uploadLocalVideo}=await import('../lib/localChunkUpload');
 assert.ok((await uploadLocalVideo(input(new File(['v'],'v.mp4',{type:'video/mp4'})))).id);
 assert.equal(f.controls.completes,2);assert.ok(f.controls.gets>=3);
});

test('a 410 response clears the stale intent so the next explicit retry can restart',async t=>{
 const f=await createUploadHttpFixture(t),{uploadLocalVideo}=await import('../lib/localChunkUpload'),args=input();
 f.controls.status=403;await assert.rejects(uploadLocalVideo(args));
 f.controls.status=0;f.controls.getStatus=410;await assert.rejects(uploadLocalVideo(args),{status:410});
 assert.equal(f.storage.size,0);f.controls.getStatus=0;
 assert.ok((await uploadLocalVideo(args)).id);assert.equal(f.sessions.size,2);
});

test('aborting a video stops the shared queue and does not finalize incomplete bytes',async t=>{
 const f=await createUploadHttpFixture(t),{uploadLocalVideo}=await import('../lib/localChunkUpload'),controller=new AbortController(),args=input();
 args.signal=controller.signal;args.onProgress=p=>{if(p.phase==='uploading'&&p.inflightBytes>0)controller.abort();};
 await assert.rejects(uploadLocalVideo(args),{name:'AbortError'});assert.equal(f.controls.completes,0);
});

test('a rejected optional thumbnail does not reject or delay the original video upload',async t=>{
 const f=await createUploadHttpFixture(t),{uploadLocalVideo}=await import('../lib/localChunkUpload');
 const result=await uploadLocalVideo({...input(new File(['v'],'v.mp4',{type:'video/mp4'})),thumbnail:Promise.reject(new Error('thumbnail unavailable'))});
 assert.ok(result.id);assert.equal(f.controls.completes,1);
});

test('simultaneous videos share two network slots and never read a whole file buffer',async t=>{
 const f=await createUploadHttpFixture(t),{uploadLocalVideo}=await import('../lib/localChunkUpload');
 const inputs=Array.from({length:3},()=>input());
 for(const args of inputs)Object.defineProperty(args.file,'arrayBuffer',{value:()=>{throw new Error('whole-file read forbidden');}});
 await Promise.all(inputs.map(uploadLocalVideo));assert.ok(f.controls.maxActive<=2);assert.equal(f.sessions.size,3);
});

test('a corrupted cached session UUID cannot substitute another same-size video',async t=>{
 const f=await createUploadHttpFixture(t),{uploadLocalVideo}=await import('../lib/localChunkUpload'),args=input();
 f.controls.status=403;f.controls.failIndex=1;await assert.rejects(uploadLocalVideo(args));
 const key=[...f.storage.keys()][0],saved=JSON.parse(f.storage.get(key)!);
 f.controls.status=0;
 const other=await uploadLocalVideo({...args,file:new File([Buffer.alloc(2097153,72)],'other.mp4',{type:'video/mp4'})});
 saved.sessionId=[...f.sessions.values()].find(s=>s.assetId===other.id).id;f.storage.set(key,JSON.stringify(saved));
 const resumed=await uploadLocalVideo(args);assert.notEqual(resumed.id,other.id);
});
