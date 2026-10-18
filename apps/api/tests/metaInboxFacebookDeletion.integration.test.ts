import test from 'node:test';import assert from 'node:assert/strict';import {createHmac,randomUUID} from 'node:crypto';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';
import {verifyMetaSignedRequest} from '../src/interactionInbox/metaDeletionRoutes';
import {createMetaGrantFence} from '../src/interactionInbox/grantFence';
import {encryptToken,decryptToken,deriveMetaDeletionKey} from '../src/utils/tokenCrypto';
const secret='synthetic-facebook-delete-secret';
async function fixture(run:(f:any,s:any)=>Promise<void>){await withFacebookManagementFixture(async f=>{
 const userId=BigInt('0x'+f.userId.replace(/-/g,'')).toString(),ns={platform:'facebook' as const,appId:'123'},fence=createMetaGrantFence(deriveMetaDeletionKey());
 await f.db.facebookManagementConnection.updateMany({where:{id:{in:f.connections.map((v:any)=>v.id)}},data:{providerUserId:userId,authorizedAt:new Date('2020-01-01'),authorizationStartedAt:new Date('2020-01-01')}});
 const d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken}),payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:userId,issued_at:Math.floor(Date.now()/1000)-2})).toString('base64url'),proof=verifyMetaSignedRequest(createHmac('sha256',secret).update(payload).digest('base64url')+'.'+payload,secret),subjectHash=fence.subjectHash(ns,userId);
 try{await run(f,{d,ns,proof,userId});}finally{await f.db.metaInboxAppDeletionRequest.deleteMany({where:{platform:'facebook',appId:'123',subjectHash}});await f.db.metaInboxGrantFence.deleteMany({where:{platform:'facebook',appId:'123',subjectHash}});}
});}

test('facebookVerifiedUserDeletionRevokesOnlyIndependentConnectionsAndPinsEveryPage',async()=>fixture(async(f,s)=>{
 const before=await f.snapshot(),selection=await f.db.facebookManagementPageSelection.findMany({where:{workspaceId:{in:f.workspaceIds}},orderBy:{id:'asc'}});
 await f.db.facebookManagedPage.create({data:{connectionId:f.connections[0].id,pageId:'101',name:'Second page',pageTokenEncrypted:'sealed:second',tasks:[],scopes:[]}});
 const first=await s.d.requestUserDeletion(s.ns,s.proof,'data_deletion'),second=await s.d.requestUserDeletion(s.ns,s.proof,'data_deletion');assert.equal(first.confirmationCode,second.confirmationCode);
 const connections=await f.db.facebookManagementConnection.findMany({where:{id:{in:f.connections.map((v:any)=>v.id)}}});assert.ok(connections.every((c:any)=>c.status==='disconnected'&&c.userTokenEncrypted===null&&c.version===2));
 const pages=await f.db.facebookManagedPage.findMany({where:{connectionId:{in:f.connections.map((v:any)=>v.id)}}});assert.ok(pages.every((p:any)=>!p.active&&!p.notificationsEnabled&&p.pageTokenEncrypted===null));
 const children=await f.db.metaInboxDeletionRequest.findMany({where:{workspaceId:{in:f.workspaceIds},platform:'facebook'}});assert.equal(children.length,3);
 const targets=children.map((r:any)=>JSON.parse(decryptToken(r.targetEncrypted)).asset.providerAssetId).sort();assert.deepEqual(targets,['100','100','101']);
 assert.deepEqual(await f.snapshot(),before);assert.deepEqual(await f.db.facebookManagementPageSelection.findMany({where:{workspaceId:{in:f.workspaceIds}},orderBy:{id:'asc'}}),selection);
 assert.equal(await s.d.status(first.confirmationCode),'pending');
}));

test('facebookUnknownLegacyConsentStaysPendingWithoutGuessingFromUpdatedAt',async()=>fixture(async(f,s)=>{
 await f.db.facebookManagementConnection.updateMany({where:{id:{in:f.connections.map((v:any)=>v.id)}},data:{authorizedAt:null,authorizationStartedAt:null}});
 const receipt=await s.d.requestUserDeletion(s.ns,s.proof,'deauthorization');assert.equal(await s.d.settleAppDeletion(receipt.confirmationCode),false);
 assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:{in:f.workspaceIds}}}),0);
 assert.ok((await f.db.facebookManagementConnection.findMany({where:{id:{in:f.connections.map((v:any)=>v.id)}}})).every((c:any)=>c.status==='active'));
}));

test('facebookSourcePurgeIsBoundedAndPreservesNewerAndUnknownEpochs',async()=>fixture(async(f,s)=>{
 const page=f.pages[0],before=await f.snapshot();
 for(const version of [1,2,null]){
  await f.db.facebookInteractionMessage.create({data:{managedPageId:page.id,connectionVersion:version,providerId:'message-'+version,participantId:'300',senderId:'300',recipientId:'100',text:'Synthetic '+version,occurredAt:new Date()}});
  await f.db.facebookInteractionComment.create({data:{managedPageId:page.id,connectionVersion:version,providerId:'comment-'+version,postId:'100_1',senderId:'300',text:'Synthetic '+version,occurredAt:new Date()}});
  await f.db.facebookInteractionSendAttempt.create({data:{managedPageId:page.id,connectionVersion:version,requestKey:randomUUID(),payloadHash:'synthetic-'+version,providerId:'sent-'+version,status:'sent'}});
 }
 await f.db.facebookInteractionEvent.create({data:{managedPageId:page.id,connectionVersion:1,eventKey:'raw-old',payload:{kind:'message',senderId:'300',recipientId:'100'}}});
 await s.d.requestUserDeletion(s.ns,s.proof,'data_deletion');const child=await f.db.metaInboxDeletionRequest.findFirstOrThrow({where:{workspaceId:f.workspaceIds[0],platform:'facebook'}});
 let done=false;for(let i=0;i<20&&!done;i++){const result=await s.d.purgeSources(child.confirmationCode,1);assert.ok(result.purged<=1);done=result.sourcesComplete;}assert.equal(done,true);
 assert.deepEqual((await f.db.facebookInteractionMessage.findMany({where:{managedPageId:page.id},orderBy:{providerId:'asc'}})).map((r:any)=>r.providerId),['message-2','message-null']);
 assert.deepEqual((await f.db.facebookInteractionComment.findMany({where:{managedPageId:page.id},orderBy:{providerId:'asc'}})).map((r:any)=>r.providerId),['comment-2','comment-null']);
 const sends=await f.db.facebookInteractionSendAttempt.findMany({where:{managedPageId:page.id}});assert.equal(sends.length,3);assert.equal(sends.find((r:any)=>r.connectionVersion===1).payloadHash,'deleted');assert.equal(sends.find((r:any)=>r.connectionVersion===2).providerId,'sent-2');
 assert.equal(await s.d.status(child.confirmationCode),'pending');assert.deepEqual(await f.snapshot(),before);
}));

test('facebookMappedDerivedPurgeCleansOnlyItsCustomerAndCompletesTruthfully',async t=>fixture(async(f,s)=>{
 const workspaceId=f.workspaceIds[0],before=await f.snapshot(),page=f.pages[0];
 const asset=await f.db.interactionAsset.create({data:{workspaceId,platform:'facebook',appNamespace:'123',providerAssetId:'100',canonicalKey:JSON.stringify(['facebook','123','100']),facebookManagedPageId:page.id,connectionVersion:1}});
 const customer=await f.db.interactionCustomer.create({data:{workspaceId}});
 await f.db.interactionIdentity.create({data:{workspaceId,assetId:asset.id,customerId:customer.id,platform:'facebook',appNamespace:'123',providerActorId:'300',displayName:'Synthetic visitor'}});
 const source={platform:'facebook',connectionId:f.connections[0].id,connectionVersion:1,managedPageId:page.id,conversationId:'thread-300',participantId:'300'};
 const c=await f.db.interactionCase.create({data:{workspaceId,assetId:asset.id,customerId:customer.id,kind:'messages',providerThreadOrEventId:'thread-300',sourceRef:source}});
 await f.db.interactionItem.create({data:{workspaceId,assetId:asset.id,caseId:c.id,platform:'facebook',providerEventId:'message-300',direction:'inbound',sourceRef:source,occurredAt:new Date()}});
 await f.db.readReceipt.create({data:{workspaceId,caseId:c.id,userId:f.userId,lastReadAt:new Date(),lastReadKey:'message-300'}});
 await f.db.customerNote.create({data:{workspaceId,customerId:customer.id,authorId:f.userId,text:'Synthetic covered note'}});
 const tag=await f.db.interactionTag.create({data:{workspaceId,kind:'customer',name:'Synthetic',normalizedName:'synthetic',color:'#16a34a'}});await f.db.interactionCustomerTag.create({data:{workspaceId,customerId:customer.id,tagId:tag.id}});
 // Database timestamps and the API wall clock can differ. Pin that skew instead
 // of hoping local scheduling reproduces it or weakening the newer-note guard.
 let receipt:{confirmationCode:string};try{t.mock.timers.enable({apis:['Date'],now:Date.now()-1000});receipt=await s.d.requestUserDeletion(s.ns,s.proof,'data_deletion');}finally{t.mock.timers.reset();}
 const child=await f.db.metaInboxDeletionRequest.findFirstOrThrow({where:{workspaceId,platform:'facebook'}});
 let sourceDone=false;for(let i=0;i<10&&!sourceDone;i++)sourceDone=(await s.d.purgeSources(child.confirmationCode,1)).sourcesComplete;assert.equal(sourceDone,true);
 let done=false;for(let i=0;i<25&&!done;i++){const result=await s.d.purgeDerived(child.confirmationCode,1);assert.ok(result.purged<=1);assert.equal(result.blocked,null);done=result.complete;}assert.equal(done,true);
 assert.equal(await s.d.status(child.confirmationCode),'completed');assert.equal(await f.db.interactionCustomer.findUnique({where:{id:customer.id}}),null);assert.ok(await f.db.interactionTag.findUnique({where:{id:tag.id}}));assert.deepEqual(await f.snapshot(),before);
 assert.equal(await s.d.settleAppDeletion(receipt.confirmationCode),false,'other independently pinned Page is not yet purged');
}));
