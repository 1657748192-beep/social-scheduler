import assert from 'node:assert/strict';
import test from 'node:test';

test('all uploader callers share two slots and a cancelled queued task never sends',async()=>{
 const {localUploadQueue}=await import('../lib/localUploadQueue');
 let active=0,max=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const controller=new AbortController();
 const tasks=Array.from({length:10},()=>localUploadQueue.run(async()=>{active++;max=Math.max(max,active);await gate;active--;return true;},new AbortController().signal));
 let sent=false;const cancelled=localUploadQueue.run(async()=>{sent=true;},controller.signal).catch(e=>e);
 controller.abort();release();await Promise.all(tasks);
 assert.ok(await cancelled instanceof Error);assert.equal(sent,false);assert.equal(max,2);
});

test('a rejected task releases its slot without poisoning the queue',async()=>{
 const {localUploadQueue}=await import('../lib/localUploadQueue');
 await assert.rejects(localUploadQueue.run(async()=>{throw new Error('network');},new AbortController().signal));
 assert.equal(await localUploadQueue.run(async()=>42,new AbortController().signal),42);
});
