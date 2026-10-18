import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHmac,randomBytes} from 'node:crypto';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {createMetaGrantFence} from '../src/interactionInbox/grantFence';import {deriveMetaDeletionKey} from '../src/utils/tokenCrypto';
const secret='synthetic-lifecycle-facebook-secret';
async function server(enabled:boolean){
 const env=require('../../../scripts/run-tests.cjs').environment(true,true),child=fork(path.resolve('apps/api/tests/fixtures/metaLifecycleHttp.ts'),[],{execArgv:['--import',pathToFileURL(require.resolve('tsx')).href],stdio:['ignore','ignore','ignore','ipc'],env:{...env,DATABASE_URL:env.FACEBOOK_TEST_DATABASE_URL,REDIS_URL:env.LOCAL_UPLOAD_TEST_REDIS_URL,FACEBOOK_MANAGEMENT_ENABLED:'false',INSTAGRAM_MANAGEMENT_ENABLED:'false',META_INBOX_DELETION_ENABLED:String(enabled),API_PUBLIC_URL:'https://example.test',FACEBOOK_CLIENT_ID:'123',FACEBOOK_CLIENT_SECRET:secret,INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-lifecycle-instagram-secret'}});
 const stop=async()=>{if(child.exitCode!==null)return;if(child.connected)child.send('stop');await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});};
 try{const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Lifecycle HTTP fixture unavailable')),15000);child.once('message',(m:any)=>{clearTimeout(timer);typeof m?.port==='number'?resolve(m.port):reject(Error('Invalid fixture'));});child.once('exit',()=>{clearTimeout(timer);reject(Error('Fixture exited'));});});return{origin:`http://127.0.0.1:${port}`,stop};}catch(e){await stop();throw e;}
}

test('realAppMountsOnlyOptedInServerBoundDeletionCallbacksAndKeepsInboxPrivate',async()=>withMetaInboxFixture(async f=>{
 const userId=BigInt('0x'+randomBytes(16).toString('hex')).toString(),payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:userId,issued_at:Math.floor(Date.now()/1000)-2})).toString('base64url'),signed=createHmac('sha256',secret).update(payload).digest('base64url')+'.'+payload,codes:string[]=[],before=await f.publishingSnapshot();
 try{for(const enabled of [false,true]){const app=await server(enabled);try{
  const endpoint=app.origin+'/api/v1/meta-lifecycle/facebook/data-deletion',send=(value:string)=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({signed_request:value})});
  const response=await send(signed);assert.equal(response.status,enabled?200:404);if(!enabled)continue;
  const body=await response.json();codes.push(body.confirmation_code);assert.equal(body.url,'https://example.test/api/v1/meta-lifecycle/facebook/status/'+body.confirmation_code);assert.deepEqual(await(await fetch(app.origin+'/api/v1/meta-lifecycle/facebook/status/'+body.confirmation_code)).json(),{status:'pending'});
  assert.equal((await fetch(app.origin+'/api/v1/meta-lifecycle/instagram/status/'+body.confirmation_code)).status,404);assert.equal((await send('tampered.'+payload)).status,403);assert.equal((await send(signed)).status,200);
  assert.equal((await fetch(app.origin+'/api/v1/webhooks/instagram',{method:'POST'})).status,410);assert.equal((await fetch(app.origin+'/api/v1/workspaces/'+f.adminCtx.workspaceId+'/interaction-inbox/accounts')).status,401);
 }finally{await app.stop();}}assert.deepEqual(await f.publishingSnapshot(),before);}
 finally{await f.db.metaInboxAppDeletionRequest.deleteMany({where:{confirmationCode:{in:codes}}});const fence=createMetaGrantFence(deriveMetaDeletionKey());await f.db.metaInboxGrantFence.deleteMany({where:{subjectHash:fence.subjectHash({platform:'facebook',appId:'123'},userId)}});}
}));
