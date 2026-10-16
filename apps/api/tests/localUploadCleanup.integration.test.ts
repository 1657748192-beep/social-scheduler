import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir,utimes,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import test from 'node:test';
import {createLocalUploadFixture} from './helpers/localUploadFixture';
import {createLocalUploadDisk} from '../src/uploads/local/disk';
import {createUploadLeases} from '../src/uploads/local/leases';
import {initSession} from '../src/uploads/local/sessions';
import {computeFingerprint} from '../src/uploads/local/protocol';
import {acceptPart,acceptThumbnail} from '../src/uploads/local/parts';
import {completeUpload} from '../src/uploads/local/complete';

async function fixture(t:any){const f=await createLocalUploadFixture(t),disk=createLocalUploadDisk(f.root);const deps={...f,disk,leases:createUploadLeases(f.redis,f.prefix),availableBytes:async()=>10n**12n};const bytes=Buffer.from('video original');const hash=createHash('sha256').update(bytes).digest('hex');const s=await initSession(deps,f.actor,{clientKey:randomUUID(),originalName:'v.mp4',mimeType:'video/mp4',sizeBytes:bytes.length,partHashes:[hash],fingerprint:await computeFingerprint(bytes.length,'video/mp4',[hash])});return {f,disk,deps,bytes,s,fill:()=>acceptPart(deps,f.actor,s.id,0,Readable.from([bytes]),new AbortController().signal)};}

test('active uploads survive expiry sweep; cancelled and expired residue release capacity only after deletion',async t=>{
 const {cleanLocalUploads,cancelUpload}=await import('../src/uploads/local/cleanup'),u=await fixture(t);await u.fill();
 await cleanLocalUploads(u.deps);assert.equal(await u.f.db.localUploadPart.count({where:{sessionId:u.s.id}}),1);
 let broken=true;const badDisk={...u.disk,removeOwned:async(keys:string[])=>{if(broken)throw Object.assign(new Error('cannot unlink'),{code:'EACCES'});await u.disk.removeOwned(keys);}};
 const cancelled=await cancelUpload({...u.deps,disk:badDisk},u.f.actor,u.s.id);assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.cleanupPending,true);
 assert.ok((await u.f.db.localUploadSession.findUniqueOrThrow({where:{id:u.s.id}})).reservedBytes>0);
 await assert.rejects(u.fill(),{statusCode:410});broken=false;
 const cleaned=await cleanLocalUploads(u.deps);assert.ok(cleaned.cleaned>=1);
 assert.equal((await u.f.db.localUploadSession.findUniqueOrThrow({where:{id:u.s.id}})).reservedBytes,0);
 assert.deepEqual(await readdir(path.join(u.f.root,'.upload-sessions',u.s.id)).catch(()=>[]),[]);
 const expired=await fixture(t);await expired.fill();await expired.f.db.localUploadSession.update({where:{id:expired.s.id},data:{expiresAt:new Date(Date.now()-1)}});
 await cleanLocalUploads(expired.deps);assert.equal((await expired.f.db.localUploadSession.findUniqueOrThrow({where:{id:expired.s.id}})).state,'expired');
});

test('cleanup preserves final media, removes private receipts and expires only completed session metadata',async t=>{
 const {cleanLocalUploads,cancelUpload}=await import('../src/uploads/local/cleanup'),u=await fixture(t);await u.fill();
 const asset=await completeUpload(u.deps,u.f.actor,u.s.id);
 assert.equal((await cancelUpload(u.deps,u.f.actor,u.s.id)).state,'completed');
 await cleanLocalUploads(u.deps);assert.deepEqual(await readFile(path.join(u.f.root,asset.storageKey)),u.bytes);
 assert.equal((await u.f.db.localUploadSession.findUniqueOrThrow({where:{id:u.s.id}})).reservedBytes,0);
 await u.f.db.localUploadSession.update({where:{id:u.s.id},data:{expiresAt:new Date(Date.now()-1)}});
 await cleanLocalUploads(u.deps);
 assert.equal(await u.f.db.localUploadSession.findUnique({where:{id:u.s.id}}),null);
 assert.deepEqual(await readFile(path.join(u.f.root,asset.storageKey)),u.bytes);
});

test('cancel aborts local in-flight input and waits for its cleanup before releasing reservation',async t=>{
 const {cancelUpload,cleanLocalUploads}=await import('../src/uploads/local/cleanup'),u=await fixture(t),input=new Readable({read(){}});
 const receiving=acceptPart(u.deps,u.f.actor,u.s.id,0,input,new AbortController().signal);const caught=receiving.catch(e=>e);
 while(!await u.deps.leases.active(u.s.id))await new Promise(resolve=>setTimeout(resolve,5));
 const result=await cancelUpload(u.deps,u.f.actor,u.s.id);assert.equal(result.state,'cancelled');
 assert.ok(await caught instanceof Error);
 await cleanLocalUploads(u.deps);
 assert.equal(await u.f.db.localUploadPart.count({where:{sessionId:u.s.id}}),0);
 assert.equal((await u.f.db.localUploadSession.findUniqueOrThrow({where:{id:u.s.id}})).reservedBytes,0);
 assert.deepEqual(await readdir(path.join(u.f.root,'.upload-sessions',u.s.id)).catch(()=>[]),[]);
});

test('orphan private files need 24 hours and no active receiver before removal',async t=>{
 const {cleanLocalUploads}=await import('../src/uploads/local/cleanup'),u=await fixture(t),sid=randomUUID();
 const dir=path.join(u.f.root,'.upload-sessions',sid);await mkdir(dir,{recursive:true});
 const key=path.join(dir,`${randomUUID()}.part`);await writeFile(key,'orphan');
 await cleanLocalUploads(u.deps);assert.equal(await readFile(key,'utf8'),'orphan');
 const old=new Date(Date.now()-25*3600000);await utimes(key,old,old);await utimes(dir,old,old);
 const held=await u.deps.leases.acquire(sid,0);assert.ok(held.ok);
 await cleanLocalUploads(u.deps);assert.equal(await readFile(key,'utf8'),'orphan');
 await u.deps.leases.release(held.lease);await cleanLocalUploads(u.deps);assert.deepEqual(await readdir(dir).catch(()=>[]),[]);
});

test('cleaning an orphan removes its empty private directory so later orphans cannot be starved',async t=>{
 const {cleanLocalUploads}=await import('../src/uploads/local/cleanup'),u=await fixture(t),sid=randomUUID();
 const dir=path.join(u.f.root,'.upload-sessions',sid);await mkdir(dir,{recursive:true});
 const file=path.join(dir,`${randomUUID()}.part`);await writeFile(file,'orphan');
 const old=new Date(Date.now()-25*3600000);await utimes(file,old,old);await utimes(dir,old,old);
 await cleanLocalUploads(u.deps);
 assert.equal((await readdir(path.join(u.f.root,'.upload-sessions'))).includes(sid),false);
});

test('a deletion failure cannot lose the receipt for an uncommitted public output',async t=>{
 const {cancelUpload,cleanLocalUploads}=await import('../src/uploads/local/cleanup'),u=await fixture(t);await u.fill();
 const part=await u.f.db.localUploadPart.findFirstOrThrow({where:{sessionId:u.s.id}});
 const output=await u.disk.assemble(u.s.id,randomUUID(),[part],new AbortController().signal,'video/mp4');
 const badDisk={...u.disk,removeOwned:async(keys:string[])=>{
  for(const key of keys){if(key===output.storageKey)throw Object.assign(new Error('cannot unlink output'),{code:'EACCES'});await u.disk.removeOwned([key]);}
 }};
 assert.equal((await cancelUpload({...u.deps,disk:badDisk},u.f.actor,u.s.id)).cleanupPending,true);
 assert.ok((await u.disk.ownedFiles(u.s.id)).some(f=>f.storageKey===output.storageKey),'output ownership must survive partial cleanup');
 await cleanLocalUploads(u.deps);
 assert.equal(await u.disk.hasFile(output.storageKey,output.sizeBytes),false);
 assert.equal((await u.f.db.localUploadSession.findUniqueOrThrow({where:{id:u.s.id}})).reservedBytes,0);
});

test('cancelling an in-flight assembly fences its commit and does not leave a ten-minute reservation',async t=>{
 const {cancelUpload}=await import('../src/uploads/local/cleanup'),u=await fixture(t);await u.fill();
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const disk={...u.disk,assemble:async(...args:Parameters<typeof u.disk.assemble>)=>{const output=await u.disk.assemble(...args);entered();await gate;return output;}};
 const merging=completeUpload({...u.deps,disk},u.f.actor,u.s.id).catch(e=>e);await started;
 const cancelling=cancelUpload(u.deps,u.f.actor,u.s.id);
 while((await u.f.db.localUploadSession.findUniqueOrThrow({where:{id:u.s.id}})).state!=='cancelled')await new Promise(resolve=>setTimeout(resolve,5));
 release();assert.equal((await merging).statusCode,409);
 assert.equal((await cancelling).cleanupPending,false);
 assert.equal(await u.f.db.mediaAsset.count({where:{workspaceId:u.f.actor.workspaceId}}),0);
 assert.deepEqual((await readdir(u.f.root)).filter(n=>n.startsWith('local-upload-')),[]);
});

test('an already-consumed thumbnail body is rejected without holding a receiver indefinitely',async t=>{
 const u=await fixture(t),body=Readable.from([Buffer.from('{}')]);for await(const _ of body){}
 // The watchdog bounds a broken receiver, not real PostgreSQL/Redis latency.
 // Slow local volumes can take over 80ms before the receiver even starts.
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{await assert.rejects(acceptThumbnail(u.deps,u.f.actor,u.s.id,body,controller.signal),{statusCode:400});}
 finally{clearTimeout(timer);}
 assert.equal(await u.deps.leases.active(u.s.id),false);
});
