import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,unlink,readdir} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import test from 'node:test';
import {createLocalUploadFixture} from './helpers/localUploadFixture';
import {computeFingerprint,MIN_FREE_BYTES} from '../src/uploads/local/protocol';
import {createLocalUploadDisk} from '../src/uploads/local/disk';
import {createUploadLeases} from '../src/uploads/local/leases';
import {initSession} from '../src/uploads/local/sessions';
import {acceptPart,acceptThumbnail} from '../src/uploads/local/parts';

async function upload(t:any){
 const f=await createLocalUploadFixture(t),disk=createLocalUploadDisk(f.root),deps={...f,disk,leases:createUploadLeases(f.redis,f.prefix),availableBytes:async()=>10n**12n};
 const bytes=Buffer.alloc(1048583,71),parts=[bytes.subarray(0,1048576),bytes.subarray(1048576)];
 const hashes=parts.map(p=>createHash('sha256').update(p).digest('hex'));
 const s=await initSession(deps,f.actor,{clientKey:randomUUID(),originalName:'original.webm',mimeType:'video/webm',sizeBytes:bytes.length,partHashes:hashes,fingerprint:await computeFingerprint(bytes.length,'video/webm',hashes)});
 return {f,disk,deps,bytes,parts,s,fill:async()=>{for(let i=0;i<parts.length;i++)await acceptPart(deps,f.actor,s.id,i,Readable.from([parts[i]]),new AbortController().signal);}};
}

test('completion rechecks output capacity after upload and preserves resumable blocks on 507',async t=>{
 const {completeUpload}=await import('../src/uploads/local/complete'),u=await upload(t);await u.fill();
 let checks=0;
 await assert.rejects(completeUpload({...u.deps,availableBytes:async()=>{checks++;return MIN_FREE_BYTES;}},u.f.actor,u.s.id),{statusCode:507});
 assert.ok(checks>0);assert.equal(await u.f.db.mediaAsset.count({where:{workspaceId:u.f.actor.workspaceId}}),0);
 assert.equal((await u.f.db.localUploadSession.findUniqueOrThrow({where:{id:u.s.id}})).state,'receiving');
 assert.equal(await u.f.db.localUploadPart.count({where:{sessionId:u.s.id}}),u.parts.length);
 assert.equal((await readdir(u.f.root)).filter(n=>n.startsWith('local-upload-')).length,0);
 assert.ok((await completeUpload(u.deps,u.f.actor,u.s.id)).id);
});

test('concurrent merge claims include the other in-flight output in capacity checks',async t=>{
 const {completeUpload}=await import('../src/uploads/local/complete'),a=await upload(t),b=await upload(t);await a.fill();await b.fill();
 let entered!:()=>void,release!:()=>void;
 const started=new Promise<void>(r=>{entered=r;}),blocked=new Promise<void>(r=>{release=r;});
 const slowDisk={...a.disk,assemble:async(...args:Parameters<typeof a.disk.assemble>)=>{entered();await blocked;return a.disk.assemble(...args);}};
 const first=completeUpload({...a.deps,disk:slowDisk},a.f.actor,a.s.id);const caught=first.then(value=>({value}),error=>({error}));
 await started;
 try{await assert.rejects(completeUpload({...b.deps,availableBytes:async()=>MIN_FREE_BYTES+BigInt(b.bytes.length)},b.f.actor,b.s.id),{statusCode:507});}
 finally{release();const result=await caught;assert.ok('value' in result&&result.value.id);}
});

test('completion requires all blocks and concurrent repeats yield one verified existing-format asset',async t=>{
 const {completeUpload}=await import('../src/uploads/local/complete');
 const u=await upload(t);
 await assert.rejects(completeUpload(u.deps,u.f.actor,u.s.id),{statusCode:409});
 await u.fill();
 const jpeg=Buffer.from([255,216,255,224,1,255,217]);
 await acceptThumbnail(u.deps,u.f.actor,u.s.id,Readable.from([jpeg]),new AbortController().signal);
 const results=await Promise.allSettled([completeUpload(u.deps,u.f.actor,u.s.id),completeUpload(u.deps,u.f.actor,u.s.id)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));
 const asset=await completeUpload(u.deps,u.f.actor,u.s.id);
 assert.equal(await u.f.db.mediaAsset.count({where:{workspaceId:u.f.actor.workspaceId}}),1);
 assert.equal(asset.mimeType,'video/webm');assert.equal(asset.originalAvailable,true);
 assert.ok(asset.storageKey.endsWith('.webm'));
 assert.deepEqual(await readFile(path.join(u.f.root,asset.storageKey)),u.bytes);
 assert.deepEqual(await readFile(path.join(u.f.root,asset.thumbnailStorageKey!)),jpeg);
 assert.equal((await completeUpload(u.deps,u.f.actor,u.s.id)).id,asset.id);
 await unlink(path.join(u.f.root,asset.storageKey));
 await assert.rejects(completeUpload(u.deps,u.f.actor,u.s.id),{statusCode:410});
 await u.f.db.mediaAsset.delete({where:{id:asset.id}});
 await assert.rejects(completeUpload(u.deps,u.f.actor,u.s.id),{statusCode:410});
});

test('rename before database rejection creates no ready asset and restart can rebuild safely',async t=>{
 const {completeUpload}=await import('../src/uploads/local/complete'),u=await upload(t);await u.fill();
 const constraint=`upload_fault_${randomUUID().replaceAll('-','')}`;
 // A real PostgreSQL write rejection, scoped only to this test uploader.
 await u.f.db.$executeRawUnsafe(`ALTER TABLE media_assets ADD CONSTRAINT "${constraint}" CHECK (uploaded_by <> '${u.f.actor.userId}'::uuid) NOT VALID`);
 t.after(()=>u.f.db.$executeRawUnsafe(`ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS "${constraint}"`));
 await assert.rejects(completeUpload(u.deps,u.f.actor,u.s.id));
 assert.equal(await u.f.db.mediaAsset.count({where:{workspaceId:u.f.actor.workspaceId}}),0);
 assert.equal((await readdir(u.f.root)).filter(n=>n.startsWith('local-upload-')).length,0);
 await u.f.db.$executeRawUnsafe(`ALTER TABLE media_assets DROP CONSTRAINT "${constraint}"`);
 const restarted={...u.deps,disk:createLocalUploadDisk(u.f.root)};
 const asset=await completeUpload(restarted,u.f.actor,u.s.id);
 assert.deepEqual(await readFile(path.join(u.f.root,asset.storageKey)),u.bytes);
});

test('an expired assembly cannot commit late or delete the next attempt result',async t=>{
 const {completeUpload}=await import('../src/uploads/local/complete'),u=await upload(t);await u.fill();
 let release!:()=>void,entered!:()=>void;
 const blocked=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const slowDisk={...u.disk,assemble:async(...args:Parameters<typeof u.disk.assemble>)=>{const result=await u.disk.assemble(...args);entered();await blocked;return result;}};
 const first=completeUpload({...u.deps,disk:slowDisk},u.f.actor,u.s.id);const caught=first.catch(e=>e);
 await started;
 await assert.rejects(completeUpload(u.deps,u.f.actor,u.s.id),{statusCode:409});
 await u.f.db.localUploadSession.update({where:{id:u.s.id},data:{mergeLeaseUntil:new Date(Date.now()-1)}});
 const winner=await completeUpload(u.deps,u.f.actor,u.s.id);release();
 assert.equal((await caught).statusCode,409);
 assert.equal(await u.f.db.mediaAsset.count({where:{workspaceId:u.f.actor.workspaceId}}),1);
 assert.deepEqual(await readFile(path.join(u.f.root,winner.storageKey)),u.bytes);
});
