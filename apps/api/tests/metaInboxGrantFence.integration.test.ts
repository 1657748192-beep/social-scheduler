import test from 'node:test';import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {createInstagramManagementStore} from '../src/instagramManagement/store';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import {verifyMetaSignedRequest} from '../src/interactionInbox/metaDeletionRoutes';
import {encryptToken,decryptToken,deriveMetaDeletionKey} from '../src/utils/tokenCrypto';
const secret='synthetic-concurrent-deletion-secret',ns={platform:'instagram' as const,appId:'456'};
async function fixture(run:(f:MetaInboxFixture,s:any)=>Promise<void>,useDefaultKey=false){
 await withMetaInboxFixture(async f=>{
  const key=useDefaultKey?deriveMetaDeletionKey():'synthetic-fence-'+f.userId,userId=useDefaultKey?BigInt('0x'+f.userId.replace(/-/g,'')).toString():'200',codes:string[]=[],issuedAt=Math.floor(Date.now()/1000)-2;
  const policy=createLiveInboxPolicy(f.workspaceIds.map(workspaceId=>({...ns,workspaceId,providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:1000,reviewed:true}})));
  const store=createInstagramManagementStore({db:f.db,encrypt:encryptToken,policy,...(useDefaultKey?{}:{hmacKey:key})}),deletion=createMetaInboxDeletion({db:f.db,...(useDefaultKey?{}:{hmacKey:key}),encrypt:encryptToken,decrypt:decryptToken});
  const grant={appId:'456',providerAccountId:'100',providerUserId:userId,accessToken:'synthetic-late-token',scopes:['instagram_business_basic','instagram_business_manage_messages','instagram_business_manage_comments'],expiresAt:new Date(Date.now()+86400000)};
  const request=async(time=issuedAt,appId='456',user=userId)=>{const payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:user,issued_at:time})).toString('base64url'),signed=createHmac('sha256',secret).update(payload).digest('base64url')+'.'+payload;const receipt=await deletion.requestUserDeletion({...ns,appId},verifyMetaSignedRequest(signed,secret),'deauthorization');codes.push(receipt.confirmationCode);return receipt;};
  const state=async(old=true)=>{const raw=randomBytes(32).toString('base64url'),saved=await store.createState(f.adminCtx,f.instagramAccountIds[0],'456',raw,'https://example.test/independent-callback');if(old)await f.db.instagramManagementOAuthState.update({where:{id:saved.id},data:{createdAt:new Date(Date.now()-20000)}});return(await store.consumeState(raw))!;};
  await f.db.instagramManagementConnection.updateMany({where:{id:{in:f.instagramConnectionIds}},data:{providerUserId:userId,authorizedAt:new Date('2020-01-01T00:00:00Z')}});
  try{await run(f,{store,deletion,grant,request,state,issuedAt,newDefaultStore:()=>createInstagramManagementStore({db:f.db,encrypt:encryptToken,policy})});}
  finally{
   await f.db.metaInboxAppDeletionRequest.deleteMany({where:{confirmationCode:{in:codes}}});
   // Only this fixture's random HMAC namespace; never sweep other subjects.
   if((f.db as any).metaInboxGrantFence){const hashes=['456','457'].flatMap(appId=>[userId,'201'].map(user=>createHmac('sha256',key).update(JSON.stringify(['app-user','instagram',appId,user])).digest('hex')));await(f.db as any).metaInboxGrantFence.deleteMany({where:{subjectHash:{in:hashes}}});}
  }
 });
}
test('deletionBeforeGrantSaveCannotRestoreTheOldConnection',async()=>fixture(async(f,s)=>{
 const saved=await s.state(),before=await f.publishingSnapshot();await s.request();
 await assert.rejects(s.store.saveGrant(saved,s.grant),(e:any)=>e.statusCode===409);
 const c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});assert.equal(c.status,'disconnected');assert.equal(c.tokenEncrypted,null);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('unmappedDeletionStillBlocksAnInFlightFirstConnection',async()=>fixture(async(f,s)=>{
 const saved=await s.state();await f.db.instagramManagementConnection.deleteMany({where:{id:{in:f.instagramConnectionIds}}});const before=await f.publishingSnapshot(),receipt=await s.request();
 assert.equal(await s.deletion.status(receipt.confirmationCode),'pending');await assert.rejects(s.store.saveGrant(saved,s.grant),(e:any)=>e.statusCode===409);
 assert.equal(await f.db.instagramManagementConnection.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('freshConsentAfterTheFenceWorksAndOldReplayDoesNotExtendItsCutoff',async()=>fixture(async(f,s)=>{
 const old=await s.state(),receipt=await s.request();await assert.rejects(s.store.saveGrant(old,s.grant),(e:any)=>e.statusCode===409);
 const fresh=await s.state(false);assert.ok(fresh.createdAt.getTime()>s.issuedAt*1000+999);const id=await s.store.saveGrant(fresh,s.grant);
 assert.equal((await s.request()).confirmationCode,receipt.confirmationCode);const c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id}});assert.equal(c.status,'active');assert.equal(decryptToken(c.tokenEncrypted!),s.grant.accessToken);
 const second=await s.state(false);await s.store.saveGrant(second,s.grant);
}));
test('olderSignedNotificationCannotMoveTheFenceBackwards',async()=>fixture(async(f,s)=>{
 const saved=await s.state();await f.db.instagramManagementOAuthState.update({where:{id:saved.id},data:{createdAt:new Date((s.issuedAt-5)*1000)}});
 await s.request();await s.request(s.issuedAt-10);await assert.rejects(s.store.saveGrant(saved,s.grant),(e:any)=>e.statusCode===409);
}));
test('anotherAppOrProviderUserCannotBlockTheSelectedGrant',async()=>{
 for(const [appId,user] of [['457','200'],['456','201']])await fixture(async(f,s)=>{const saved=await s.state(),before=await f.publishingSnapshot();await s.request(s.issuedAt,appId,user);const id=await s.store.saveGrant(saved,s.grant);assert.equal((await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id}})).status,'active');assert.deepEqual(await f.publishingSnapshot(),before);});
});
test('completedReceiptDoesNotForgetTheStaleAuthorizationFence',async()=>fixture(async(f,s)=>{
 const saved=await s.state(),receipt=await s.request();await f.db.metaInboxAppDeletionRequest.update({where:{confirmationCode:receipt.confirmationCode},data:{status:'completed',targetEncrypted:null,completedAt:new Date()}});
 await assert.rejects(s.store.saveGrant(saved,s.grant),(e:any)=>e.statusCode===409);
}));

test('defaultKeyIsSharedAfterRecreatingTheStoreWithoutNewCredentials',async()=>fixture(async(f,s)=>{
 const saved=await s.state(),before=await f.publishingSnapshot();await s.request();
 const recreated=s.newDefaultStore();await assert.rejects(recreated.saveGrant(saved,s.grant),(e:any)=>e.statusCode===409);assert.deepEqual(await f.publishingSnapshot(),before);
},true));
test('grantStartAtTheFenceBoundaryIsRejectedButStrictlyLaterStartIsAllowed',async()=>{
 for(const delta of [-1,0,1])await fixture(async(f,s)=>{
  const saved=await s.state(),cutoff=(s.issuedAt+1)*1000-1;await s.request();await f.db.instagramManagementOAuthState.update({where:{id:saved.id},data:{createdAt:new Date(cutoff+delta)}});
  if(delta<=0)await assert.rejects(s.store.saveGrant(saved,s.grant),(e:any)=>e.statusCode===409);
  else{const id=await s.store.saveGrant(saved,s.grant);assert.equal((await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id}})).authorizationStartedAt?.getTime(),cutoff+1);}
 });
});

async function waitingBehind(db:any,pid:number){return(await db.$queryRaw`SELECT a.pid FROM pg_stat_activity a WHERE ${pid}::int=ANY(pg_blocking_pids(a.pid))` as Array<{pid:number}>).map(v=>v.pid);}
test('grantWinningTheLockIsStillRevokedWhenItsConsentPredatesTheNotification',async()=>{
 for(const firstConnection of [false,true])await fixture(async(f,s)=>{
 if(firstConnection)await f.db.instagramManagementConnection.deleteMany({where:{id:{in:f.instagramConnectionIds}}});
 const saved=await s.state(),before=await f.publishingSnapshot();let announce!:(pid:number)=>void,rejectReady!:(error:unknown)=>void,release!:()=>void;
 const ready=new Promise<number>((r,j)=>{announce=r;rejectReady=j;}),gate=new Promise<void>(r=>release=r);
 const locker=f.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM user_sessions WHERE id=${f.sessionId}::uuid FOR UPDATE`;const [row]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`;announce(row.pid);await gate;},{timeout:15000});void locker.catch(rejectReady);
 const pid=await ready,save=s.store.saveGrant(saved,s.grant);void save.catch(()=>{});let observed=false,request:Promise<any>|undefined;
 try{
  let waiter:number|undefined;const until=Date.now()+5000;while(Date.now()<until){waiter=(await waitingBehind(f.db,pid))[0];if(waiter)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiter,'exercise actual blocked grant transaction');
  let settled=false;request=s.request().finally(()=>{settled=true;});void request.catch(()=>{});
  const limit=Date.now()+5000;while(Date.now()<limit){if(settled||(await waitingBehind(f.db,waiter!)).length){observed=true;break;}await new Promise(r=>setTimeout(r,10));}
 }finally{release();await locker;}
 await save;if(request)await request;assert.equal(observed,true,'observe callback completion or its real subject-lock wait');
 const c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{workspaceId_appId_providerAccountId:{workspaceId:f.adminCtx.workspaceId,appId:'456',providerAccountId:'100'}}});assert.equal(c.status,'disconnected');assert.equal(c.tokenEncrypted,null);assert.deepEqual(await f.publishingSnapshot(),before);
 });
});
