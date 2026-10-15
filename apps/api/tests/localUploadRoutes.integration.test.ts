import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import nodeHttp from 'node:http';
import test from 'node:test';
import {createLocalUploadFixture} from './helpers/localUploadFixture';
import {startLocalUploadHttp} from './helpers/localUploadHttp';
import {computeFingerprint} from '../src/uploads/local/protocol';
import {createUploadLeases} from '../src/uploads/local/leases';

async function manifest(bytes:Buffer){const hashes=[createHash('sha256').update(bytes).digest('hex')];return {clientKey:randomUUID(),originalName:'test.mp4',mimeType:'video/mp4',sizeBytes:bytes.length,partHashes:hashes,fingerprint:await computeFingerprint(bytes.length,'video/mp4',hashes)};}

test('real login protects every route; duplicate verified parts remain one row and status survives lost acknowledgement',async t=>{
 const f=await createLocalUploadFixture(t), http=await startLocalUploadHttp(t,f),bytes=Buffer.from('small original video'),m=await manifest(bytes);
 assert.equal((await fetch(http.base+'/upload-capabilities')).status,401);
 const cap=await (await http.request('/upload-capabilities')).json();
 assert.equal(cap.protocol,'local-chunks-v1');assert.equal(cap.ownerUserId,f.actor.userId);
 const init=await http.request('/upload-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
 assert.equal(init.status,201); const s=await init.json();
 const endpoints=[['GET',`/upload-sessions/${s.id}`],['PUT',`/upload-sessions/${s.id}/parts/0`],['PUT',`/upload-sessions/${s.id}/thumbnail`],['POST',`/upload-sessions/${s.id}/complete`],['DELETE',`/upload-sessions/${s.id}`]];
 const other=await createLocalUploadFixture(t), second=await startLocalUploadHttp(t,other);
 for(const [method,suffix] of endpoints){
  const denied=await fetch(http.base+suffix,{method,headers:{Authorization:`Bearer ${second.token}`}});assert.equal(denied.status,404);
  const wrongSpace=await fetch(http.base.replace(f.actor.workspaceId,other.actor.workspaceId)+suffix,{method,headers:{Authorization:`Bearer ${http.token}`}});assert.equal(wrongSpace.status,404);
 }
 assert.equal((await http.request(`/upload-sessions/${s.id}/parts/0`,{method:'PUT',body:bytes})).status,200);
 assert.equal((await http.request(`/upload-sessions/${s.id}/parts/0`,{method:'PUT',body:bytes})).status,200);
 assert.equal((await http.request(`/upload-sessions/${s.id}/parts/0`,{method:'PUT',body:Buffer.alloc(bytes.length)})).status,409);
 assert.equal(await f.db.localUploadPart.count({where:{sessionId:s.id}}),1);
 assert.deepEqual((await(await http.request(`/upload-sessions/${s.id}`)).json()).receivedParts,[0]);
 assert.equal((await http.request(`/upload-sessions/${s.id}/thumbnail`,{method:'PUT',body:Buffer.from('not jpeg')})).status,400);
 assert.equal((await http.request(`/upload-sessions/${s.id}/thumbnail`,{method:'PUT',body:Buffer.from([255,216,255,224,1,255,217])})).status,200);
 assert.equal((await http.request(`/upload-sessions/${s.id}/thumbnail`,{method:'PUT',body:Buffer.alloc(102401)})).status,413);
 await f.db.workspaceMember.update({where:{workspaceId_userId:{workspaceId:f.actor.workspaceId,userId:f.actor.userId}},data:{role:'viewer'}});
 assert.equal((await http.request(`/upload-sessions/${s.id}/parts/0`,{method:'PUT',body:bytes})).status,403);
});

test('oversize streaming thumbnail returns 413 before destroying the upload socket',async t=>{
 const f=await createLocalUploadFixture(t),http=await startLocalUploadHttp(t,f),m=await manifest(Buffer.from('v'));
 const session=await(await http.request('/upload-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)})).json();
 const status=await new Promise<number>((resolve,reject)=>{
  const req=nodeHttp.request(`${http.base}/upload-sessions/${session.id}/thumbnail`,{method:'PUT',headers:{Authorization:`Bearer ${http.token}`,'Content-Type':'application/octet-stream','Content-Length':200000}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode!));});
  req.on('error',reject);req.setTimeout(3000,()=>req.destroy(new Error('Response timeout')));
  req.write(Buffer.alloc(110000));
 });
 assert.equal(status,413);
});

test('part reception fails closed on Redis error and cancelled session cannot confirm late bytes',async t=>{
 const f=await createLocalUploadFixture(t),bytes=Buffer.from('video bytes');
 const {createLocalUploadDisk}=await import('../src/uploads/local/disk');
 const {createUploadLeases}=await import('../src/uploads/local/leases');
 const {acceptPart}=await import('../src/uploads/local/parts');
 const {initSession}=await import('../src/uploads/local/sessions');
 const disk=createLocalUploadDisk(f.root),leases=createUploadLeases(f.redis,f.prefix),deps={...f,disk,leases,availableBytes:async()=>10n**12n};
 const session=await initSession(deps,f.actor,await manifest(bytes));
 const input=new Readable({read(){}}),controller=new AbortController();
 const receiving=acceptPart(deps,f.actor,session.id,0,input,controller.signal);
 while(!await leases.active(session.id))await new Promise(resolve=>setTimeout(resolve,5));
 await f.db.localUploadSession.update({where:{id:session.id},data:{state:'cancelled'}});
 input.push(bytes);input.push(null);
 await assert.rejects(receiving,{statusCode:410});
 assert.equal(await f.db.localUploadPart.count({where:{sessionId:session.id}}),0);
 assert.deepEqual(await readdir(path.join(f.root,'.upload-sessions',session.id)),[]);
 await f.db.localUploadSession.update({where:{id:session.id},data:{state:'receiving'}});
 f.redis.disconnect();
 await assert.rejects(acceptPart(deps,f.actor,session.id,0,Readable.from([bytes]),controller.signal),{statusCode:503});
 assert.deepEqual(await readdir(path.join(f.root,'.upload-sessions',session.id)),[]);
});

test('HTTP part busy and capacity responses enforce the same atomic Redis limits',async t=>{
 const f=await createLocalUploadFixture(t),http=await startLocalUploadHttp(t,f),leases=createUploadLeases(f.redis,f.prefix);
 const hashes=Array.from({length:3},()=> '0'.repeat(64)),sizeBytes=2097153;
 const m={clientKey:randomUUID(),originalName:'three.mp4',mimeType:'video/mp4',sizeBytes,partHashes:hashes,fingerprint:await computeFingerprint(sizeBytes,'video/mp4',hashes)};
 const init=await http.request('/upload-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
 assert.equal(init.status,201);const session=await init.json();
 const a=await leases.acquire(session.id,0);assert.ok(a.ok);
 const busy=await http.request(`/upload-sessions/${session.id}/parts/0`,{method:'PUT',body:'x'});
 assert.equal(busy.status,409);assert.equal((await busy.json()).details.code,'part_busy');
 const upper=await http.request(`/upload-sessions/${session.id.toUpperCase()}/parts/0`,{method:'PUT',body:'x'});
 assert.equal(upper.status,409);assert.equal((await upper.json()).details.code,'part_busy');
 const b=await leases.acquire(session.id,1);assert.ok(b.ok);
 assert.equal((await http.request(`/upload-sessions/${session.id}/parts/2`,{method:'PUT',body:'x'})).status,429);
 await leases.release(a.lease);await leases.release(b.lease);
 for(let i=0;i<8;i++)assert.ok((await leases.acquire(randomUUID(),0)).ok);
 assert.equal((await http.request(`/upload-sessions/${session.id}/parts/2`,{method:'PUT',body:'x'})).status,429);
 const oversized=await http.request('/upload-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(1048577)})});
 assert.ok(oversized.status>=400);
});
