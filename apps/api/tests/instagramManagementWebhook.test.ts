import test,{after} from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import express from 'express';
import {createInstagramManagementWebhook} from '../src/instagramManagement/webhook';
import {startInstagramManagementPump} from '../src/instagramManagement/receptionPump';
const secret='synthetic-app-secret';const envelope=JSON.stringify({object:'instagram',entry:[{id:'100',time:1700000000,messaging:[{sender:{id:'300'},recipient:{id:'100'},timestamp:1700000000000,message:{mid:'mid-1',text:'Synthetic only'}}]}]});
const signature=(raw:string)=>'sha256='+createHmac('sha256',secret).update(raw).digest('hex');
let appLoaded=false;
async function withServer(store:any,run:(url:string)=>Promise<void>){
 const app=express();app.use('/hook',createInstagramManagementWebhook({appSecret:secret,verifyToken:'synthetic-verify',store}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{await run(`http://127.0.0.1:${(server.address() as any).port}/hook`);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}
test('tamperedRawBytesRejected',async()=>{
 let accepted=0;await withServer({enqueue:async()=>{accepted++;}},async url=>{
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature(envelope)},body:envelope+' '})).status,403);assert.equal(accepted,0);
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature(envelope)},body:envelope})).status,200);assert.equal(accepted,1);
  assert.equal((await fetch(url+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=test')).status,403);assert.equal(await(await fetch(url+'?hub.mode=subscribe&hub.verify_token=synthetic-verify&hub.challenge=test')).text(),'test');
 });
});
test('databaseFailureNeverReceivesSuccessfulAcknowledgement',async()=>withServer({enqueue:async()=>{throw Error('private-db-password');}},async url=>{
 const result=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature(envelope)},body:envelope});assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private-db-password/);
}));
test('durableEnqueueIsAwaitedAndOversizeBodyRejected',async()=>{
 let release!:()=>void,accepted=false;const gate=new Promise<void>(r=>release=r);
 await withServer({enqueue:async(events:any[])=>{assert.equal(events[0].senderId,'300');await gate;accepted=true;}},async url=>{
  const request=fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature(envelope)},body:envelope});await new Promise(r=>setTimeout(r,20));assert.equal(accepted,false);release();assert.equal((await request).status,200);assert.equal(accepted,true);
  const huge='x'.repeat(1048577),oversize=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature(huge)},body:huge});assert.equal(oversize.status,413);assert.doesNotMatch(await oversize.text(),/PayloadTooLargeError|<pre>|AppData/);
 });
});
test('disabledPumpHasNoTimerAndEnabledPumpIsBoundedNonReentrant',async()=>{
 let timers=0;const forbidden=new Proxy({}, {get(){throw Error('disabled pump touched store');}});await startInstagramManagementPump({enabled:false,store:forbidden as any,schedule:(()=>{timers++;}) as any}).stop();assert.equal(timers,0);
 let tick!:()=>void,release!:()=>void,processed=0,claims=0;const gate=new Promise<void>(r=>release=r),store:any={prune:async()=>{},claimBatch:async(_now:Date,limit:number)=>{claims++;assert.equal(limit,50);await gate;return Array.from({length:60},(_,i)=>({id:String(i),claimToken:'claim'}));},processClaim:async()=>{processed++;},finishClaim:async()=>{},failClaim:async()=>{}};
 const pump=startInstagramManagementPump({enabled:true,store,schedule:((fn:any)=>{tick=fn;return{unref(){}};}) as any,unschedule:()=>{}});tick();tick();await new Promise(r=>setImmediate(r));assert.equal(claims,1);let stopped=false;const closing=pump.stop().then(()=>{stopped=true;});await new Promise(r=>setImmediate(r));assert.equal(stopped,false);release();await closing;assert.ok(processed<=50);tick();assert.equal(claims,1);
});
test('enabledPumpProcessesFiftyEvenIfClaimDependencyOverReturns',async()=>{
 let tick!:()=>void,processed=0;const store:any={prune:async()=>{},claimBatch:async()=>Array.from({length:60},(_,i)=>({id:String(i),claimToken:'claim'})),processClaim:async()=>{processed++;},finishClaim:async()=>{},failClaim:async()=>{}};
 const pump=startInstagramManagementPump({enabled:true,store,schedule:((fn:any)=>{tick=fn;return{unref(){}};}) as any,unschedule:()=>{}});tick();await new Promise(r=>setImmediate(r));assert.equal(processed,50);await pump.stop();
});
test('realAppMountsNewRawCallbackOnlyWhenEnabledAndKeepsRetiredRoutesClosed',async()=>{
 const env=require('../../../scripts/run-tests.cjs').environment(true,true);
 process.env.DATABASE_URL=env.FACEBOOK_TEST_DATABASE_URL;process.env.REDIS_URL=env.LOCAL_UPLOAD_TEST_REDIS_URL;process.env.FACEBOOK_MANAGEMENT_ENABLED='false';process.env.INSTAGRAM_MANAGEMENT_ENABLED='false';process.env.INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED='false';
 const {redis}=await import('../src/redis');redis.on('error',()=>{});const {createApp}=await import('../src/app');appLoaded=true;
 let accepted=0;const hook=createInstagramManagementWebhook({appSecret:secret,verifyToken:'synthetic-verify',store:{enqueue:async()=>{accepted++;}}});
 for(const enabled of [false,true]){
  const runtime:any={enabled:true,receptionEnabled:enabled,webhook:hook,require:async()=>{},oauth:{},status:async()=>({}),disconnect:async()=>({})};
  const server=createApp({instagramManagement:runtime}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
   const result=await fetch(base+'/api/v1/webhooks/instagram',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature(envelope)},body:envelope});assert.equal(result.status,enabled?200:410);
   assert.equal((await fetch(base+'/api/v1/workspaces/11111111-1111-4111-8111-111111111111/instagram/posts/22222222-2222-4222-8222-222222222222/comments')).status,410);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 }
 assert.equal(accepted,1);
});
after(async()=>{if(!appLoaded)return;await(await import('../src/queues/publishQueue')).publishQueue.close();(await import('../src/uploads/local/runtime')).localUploadRedis.disconnect();(await import('../src/redis')).redis.disconnect();await(await import('../src/prisma')).prisma.$disconnect();});
