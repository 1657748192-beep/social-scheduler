import test from 'node:test';import assert from 'node:assert/strict';import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import express from 'express';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';
import {createMetaDeletionRouter,verifyMetaSignedRequest} from '../src/interactionInbox/metaDeletionRoutes';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
const secret='synthetic-app-deletion-secret-only',providerUserId='91000000000000200';
const ns={platform:'instagram' as const,appId:'456'};
const testIssuedAt=Math.floor(Date.now()/1000);
const sign=(user=providerUserId,issuedAt=testIssuedAt)=>{const payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:user,issued_at:issuedAt})).toString('base64url');return createHmac('sha256',secret).update(payload).digest('base64url')+'.'+payload;};
async function fixture(run:(f:MetaInboxFixture,d:any,request:(user?:string,reason?:'data_deletion'|'deauthorization')=>Promise<any>)=>Promise<void>){
 return withMetaInboxFixture(async f=>{
  const d=createMetaInboxDeletion({db:f.db,hmacKey:'synthetic-app-key-'+f.userId,encrypt:encryptToken,decrypt:decryptToken}) as any,codes:string[]=[];
  const request=async(user=providerUserId,reason:'data_deletion'|'deauthorization'='data_deletion')=>{assert.equal(typeof d.requestUserDeletion,'function','verified app-user admission required');const value=await d.requestUserDeletion(ns,verifyMetaSignedRequest(sign(user),secret),reason);codes.push(value.confirmationCode);return value;};
  try{await run(f,d,request);}finally{if((f.db as any).metaInboxAppDeletionRequest)await (f.db as any).metaInboxAppDeletionRequest.deleteMany({where:{confirmationCode:{in:codes}}});}
 });
}
async function knownGrants(f:MetaInboxFixture){
 await (f.db.instagramManagementConnection as any).updateMany({where:{id:{in:f.instagramConnectionIds}},data:{providerUserId,authorizedAt:new Date('2020-01-01T00:00:00Z')}});
}
async function childRequests(f:MetaInboxFixture,code:string){
 const row=await (f.db as any).metaInboxAppDeletionRequest.findUniqueOrThrow({where:{confirmationCode:code}});
 return JSON.parse(decryptToken(row.targetEncrypted)).targets as Array<{id:string;workspaceId:string}>;
}
test('appDeletionSchemaDoesNotRewritePublishingState',async()=>fixture(async(f)=>{
 const before=await f.publishingSnapshot();assert.ok((f.db as any).metaInboxAppDeletionRequest,'durable app-level receipt required');
 await knownGrants(f);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('databaseEnforcesAppNamespaceLengthAndOnlyFullyCleanedReceiptState',async()=>fixture(async f=>{
 const data={platform:'instagram',appId:'1'.repeat(256),subjectHash:'a'.repeat(64),requestKey:randomUUID().replace(/-/g,'').repeat(2),reason:'data_deletion',confirmationCode:randomBytes(32).toString('base64url'),targetEncrypted:'sealed:synthetic'};
 const row=await f.db.metaInboxAppDeletionRequest.create({data});
 try{
  for(const appId of ['1'.repeat(257),'not-an-app',''])await assert.rejects(f.db.metaInboxAppDeletionRequest.update({where:{id:row.id},data:{appId}}));
  await assert.rejects(f.db.metaInboxAppDeletionRequest.update({where:{id:row.id},data:{status:'completed',completedAt:new Date()}}));
  assert.equal((await f.db.metaInboxAppDeletionRequest.findUniqueOrThrow({where:{id:row.id}})).status,'pending');
 }finally{await f.db.metaInboxAppDeletionRequest.delete({where:{id:row.id}});}
}));
test('deletionForAppUserPurgesOnlyItsVerifiedConnections',async()=>fixture(async(f,d,request)=>{
 await knownGrants(f);const own=await seedDeletionCustomer(f);
 const other=await f.db.instagramManagementConnection.create({data:{workspaceId:f.adminCtx.workspaceId,appId:'457',providerAccountId:'100',providerUserId,userId:f.userId,tokenEncrypted:'sealed:other-app',status:'active'}});
 const before=await f.publishingSnapshot(),{confirmationCode}=await request();
 for(const id of f.instagramConnectionIds){const c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id}});assert.equal(c.status,'disconnected');assert.equal(c.tokenEncrypted,null);assert.equal(c.version,2);}
 assert.deepEqual(await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:other.id}}),other);
 assert.equal(await d.status(confirmationCode),'pending');assert.deepEqual(await f.publishingSnapshot(),before);
 const targets=await childRequests(f,confirmationCode);assert.equal(targets.length,2);
 const target=targets.find(v=>v.workspaceId===f.adminCtx.workspaceId)!;
 const child=await f.db.metaInboxDeletionRequest.findUniqueOrThrow({where:{id:target.id}});let done=false;
 for(let i=0;i<30&&!done;i++)done=(await d.purgeSources(child.confirmationCode,2)).sourcesComplete;assert.equal(done,true);
 done=false;for(let i=0;i<100&&!done;i++){const r=await d.purgeDerived(child.confirmationCode,2);assert.equal(r.blocked,null);done=r.complete;}assert.equal(done,true);
 assert.equal(await f.db.customerNote.findUnique({where:{id:own.note.id}}),null);assert.equal(await d.settleAppDeletion(confirmationCode),false,'other workspace cleanup is not silently omitted');
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('clonedOrForgedProofCannotCreateReceiptOrDisconnect',async()=>fixture(async(f,d)=>{
 assert.equal(typeof d.requestUserDeletion,'function');const before=await f.publishingSnapshot(),connections=await f.db.instagramManagementConnection.findMany({where:{id:{in:f.instagramConnectionIds}}});
 for(const proof of [{userId:providerUserId,issuedAt:Math.floor(Date.now()/1000)},{...verifyMetaSignedRequest(sign(),secret)}])await assert.rejects(d.requestUserDeletion(ns,proof,'data_deletion'));
 assert.equal(await (f.db as any).metaInboxAppDeletionRequest.count(),0);assert.deepEqual(await f.db.instagramManagementConnection.findMany({where:{id:{in:f.instagramConnectionIds}}}),connections);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('sameSignedRequestIsAtomicAndCannotExpandAfterNewConsent',async()=>fixture(async(f,d,request)=>{
 await knownGrants(f);const signed=verifyMetaSignedRequest(sign(),secret),first=await request();
 const results=await Promise.all([d.requestUserDeletion(ns,signed,'data_deletion'),d.requestUserDeletion(ns,signed,'data_deletion')]);assert.ok(results.every(v=>v.confirmationCode===first.confirmationCode));
 assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:{in:f.workspaceIds}}}),2);
 await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{status:'active',version:3,tokenEncrypted:'sealed:fresh-consent'}});
 assert.equal((await d.requestUserDeletion(ns,signed,'data_deletion')).confirmationCode,first.confirmationCode);
 const c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});assert.equal(c.version,3);assert.equal(c.tokenEncrypted,'sealed:fresh-consent');
}));
test('unmappedUserAndUnknownOrNewerGrantStayPendingWithoutGuessing',async()=>fixture(async(f,d,request)=>{
 const original=await f.db.instagramManagementConnection.findMany({where:{id:{in:f.instagramConnectionIds}}});
 const unknown=await request('91000000000000999');assert.equal(await d.status(unknown.confirmationCode),'pending');assert.equal(await d.settleAppDeletion(unknown.confirmationCode),false);
 await (f.db.instagramManagementConnection as any).updateMany({where:{id:{in:f.instagramConnectionIds}},data:{providerUserId,authorizedAt:new Date(Date.now()+10000)}});
 const newer=await request();assert.equal(await d.settleAppDeletion(newer.confirmationCode),false);
 const current=await f.db.instagramManagementConnection.findMany({where:{id:{in:f.instagramConnectionIds}}});assert.ok(current.every(c=>c.status==='active'&&c.version===1&&c.tokenEncrypted==='sealed:independent'));
 assert.equal(original.length,current.length);const row=await (f.db as any).metaInboxAppDeletionRequest.findUniqueOrThrow({where:{confirmationCode:newer.confirmationCode}});assert.doesNotMatch(JSON.stringify(row),new RegExp(providerUserId));
}));
test('appReceiptCompletesOnlyAfterEveryPinnedChildAndForgetsEncryptedLocator',async()=>fixture(async(f,d,request)=>{
 await knownGrants(f);
 for(let i=0;i<2;i++)await f.db.interactionAsset.create({data:{workspaceId:f.workspaceIds[i],canonicalKey:JSON.stringify(['instagram','456','100']),platform:'instagram',appNamespace:'456',providerAssetId:'100',instagramConnectionId:f.instagramConnectionIds[i],connectionVersion:1}});
 const receipt=await request(),targets=await childRequests(f,receipt.confirmationCode);
 for(const target of targets){const c=await f.db.metaInboxDeletionRequest.findUniqueOrThrow({where:{id:target.id}});let done=false;for(let i=0;i<10&&!done;i++)done=(await d.purgeSources(c.confirmationCode,2)).sourcesComplete;assert.equal(done,true);assert.equal((await d.purgeDerived(c.confirmationCode,2)).complete,true);}
 assert.equal(await d.settleAppDeletion(receipt.confirmationCode),true);assert.equal(await d.status(receipt.confirmationCode),'completed');
 assert.equal((await (f.db as any).metaInboxAppDeletionRequest.findUniqueOrThrow({where:{confirmationCode:receipt.confirmationCode}})).targetEncrypted,null);
}));

test('missingOrForeignChildCannotBeReportedAsCompletedAppDeletion',async()=>fixture(async(f,d,request)=>{
 await knownGrants(f);const receipt=await request(),targets=await childRequests(f,receipt.confirmationCode);
 await f.db.metaInboxDeletionRequest.updateMany({where:{id:{in:targets.map(v=>v.id)}},data:{status:'completed',completedAt:new Date(),targetEncrypted:null}});
 const parent=await f.db.metaInboxAppDeletionRequest.findUniqueOrThrow({where:{confirmationCode:receipt.confirmationCode}}),locator=JSON.parse(decryptToken(parent.targetEncrypted!));
 locator.targets[0].workspaceId=randomUUID();await f.db.metaInboxAppDeletionRequest.update({where:{id:parent.id},data:{targetEncrypted:encryptToken(JSON.stringify(locator))}});assert.equal(await d.settleAppDeletion(receipt.confirmationCode),false);
 await f.db.metaInboxAppDeletionRequest.update({where:{id:parent.id},data:{targetEncrypted:parent.targetEncrypted}});await f.db.metaInboxDeletionRequest.delete({where:{id:targets[0].id}});assert.equal(await d.settleAppDeletion(receipt.confirmationCode),false);assert.equal(await d.status(receipt.confirmationCode),'pending');
}));
test('verifiedHttpCallbackReturnsOnlyOpaqueReceiptAndForgeryDoesNotWrite',async()=>fixture(async(f,d,request)=>{
 await knownGrants(f);const receipt=await request(),app=express();app.use('/hook',createMetaDeletionRouter({namespace:ns,secret,statusBaseUrl:'https://example.test/hook/status',deletion:d,statusStore:d}));
 const http=app.listen(0,'127.0.0.1');await new Promise<void>(r=>http.once('listening',r));
 try{const base=`http://127.0.0.1:${(http.address() as any).port}/hook`;
  const result=await fetch(base+'/data-deletion',{method:'POST',body:new URLSearchParams({signed_request:sign(),appId:'457',workspaceId:randomUUID()})});assert.equal(result.status,200);const body=await result.json() as any;assert.equal(body.confirmation_code,receipt.confirmationCode);assert.deepEqual(Object.keys(body).sort(),['confirmation_code','url']);
  const status=await fetch(base+'/status/'+receipt.confirmationCode);assert.deepEqual(await status.json(),{status:'pending'});assert.equal(status.headers.get('cache-control'),'no-store');
  const count=await (f.db as any).metaInboxAppDeletionRequest.count();assert.equal((await fetch(base+'/deauthorize',{method:'POST',body:new URLSearchParams({signed_request:'forged.payload'})})).status,403);assert.equal(await (f.db as any).metaInboxAppDeletionRequest.count(),count);
 }finally{http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}
}));

test('legacyGrantWithoutAuthorizationEpochCannotBeGuessedFromUpdatedAt',async()=>fixture(async(f,d,request)=>{
 await knownGrants(f);await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{authorizedAt:null,updatedAt:new Date('2020-01-01T00:00:00Z')}});
 const receipt=await request(),c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});
 assert.equal(c.status,'active');assert.equal(c.tokenEncrypted,'sealed:independent');assert.equal(c.version,1);assert.equal(await d.settleAppDeletion(receipt.confirmationCode),false);
 assert.equal((await childRequests(f,receipt.confirmationCode)).length,1,'only the other known older grant may be admitted');
}));

test('consentAtSignedSecondBoundaryIsAmbiguousAndMustRemainPending',async()=>{
 for(const [delta,revoked] of [[-1,true],[0,false],[1,false]] as const)await fixture(async(f,d,request)=>{
  await f.db.instagramManagementConnection.updateMany({where:{id:{in:f.instagramConnectionIds}},data:{providerUserId,authorizedAt:new Date(testIssuedAt*1000+delta)}});
  const receipt=await request(),rows=await f.db.instagramManagementConnection.findMany({where:{id:{in:f.instagramConnectionIds}}});
  assert.ok(rows.every(c=>c.status===(revoked?'disconnected':'active')));assert.equal((await childRequests(f,receipt.confirmationCode)).length,revoked?2:0);assert.equal(await d.status(receipt.confirmationCode),'pending');
 });
});

async function extraConnections(f:MetaInboxFixture,count:number){
 const providers=Array.from({length:count},(_,i)=>String(1000+i));
 await f.db.socialAccount.createMany({data:providers.map(providerAccountId=>({workspaceId:f.adminCtx.workspaceId,platform:'instagram' as const,providerAccountId,accountType:'business',displayName:'Synthetic limit account'}))});
 await f.db.instagramManagementConnection.createMany({data:providers.map(providerAccountId=>({workspaceId:f.adminCtx.workspaceId,appId:'456',providerAccountId,providerUserId,userId:f.userId,authorizedAt:new Date('2020-01-01T00:00:00Z'),status:'active',tokenEncrypted:'sealed:synthetic-limit'}))});
}
test('fiftyVerifiedConnectionsAreAdmittedButFiftyOneRollsBackWithoutPartialRevocation',async()=>{
 await fixture(async(f,d,request)=>{await knownGrants(f);await extraConnections(f,48);const before=await f.publishingSnapshot(),receipt=await request();assert.equal((await childRequests(f,receipt.confirmationCode)).length,50);assert.deepEqual(await f.publishingSnapshot(),before);});
 await fixture(async(f,d,request)=>{await knownGrants(f);await extraConnections(f,49);const before=await f.publishingSnapshot();await assert.rejects(request(),(e:any)=>e.statusCode===409);assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:{in:f.workspaceIds}}}),0);assert.equal(await f.db.instagramManagementConnection.count({where:{workspaceId:{in:f.workspaceIds},status:'disconnected'}}),0);assert.deepEqual(await f.publishingSnapshot(),before);});
});

test('deauthorizationHttpAcknowledgesOnlyAfterIndependentRevocationCommits',async()=>fixture(async(f,d,request)=>{
 await knownGrants(f);await request(undefined,'deauthorization');const before=await f.publishingSnapshot();
 const app=express();app.use('/hook',createMetaDeletionRouter({namespace:ns,secret,statusBaseUrl:'https://example.test/hook/status',deletion:d,statusStore:d}));const http=app.listen(0,'127.0.0.1');await new Promise<void>(r=>http.once('listening',r));
 try{const response=await fetch(`http://127.0.0.1:${(http.address() as any).port}/hook/deauthorize`,{method:'POST',body:new URLSearchParams({signed_request:sign()})});assert.equal(response.status,200);assert.deepEqual(await response.json(),{accepted:true});assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:{in:f.workspaceIds}}}),2);assert.deepEqual(await f.publishingSnapshot(),before);}
 finally{http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}
}));
