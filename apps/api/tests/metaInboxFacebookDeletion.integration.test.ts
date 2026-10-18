import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
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
