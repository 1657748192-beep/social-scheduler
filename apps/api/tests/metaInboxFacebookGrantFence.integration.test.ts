import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {createFacebookManagementStore} from '../src/facebookManagement/store';
import {createMetaGrantFence} from '../src/interactionInbox/grantFence';
import {deriveMetaDeletionKey,encryptToken} from '../src/utils/tokenCrypto';

async function fixture(run:(f:any,s:any)=>Promise<void>){await withFacebookManagementFixture(async f=>{
 const ns={platform:'facebook' as const,appId:'123'},fence=createMetaGrantFence(deriveMetaDeletionKey()),store=createFacebookManagementStore(f.db,encryptToken);
 const userId=BigInt('0x'+f.userId.replace(/-/g,'')).toString(),grant={appId:'123',providerUserId:userId,userToken:'synthetic-independent-token',scopes:f.scopes,expiresAt:null,pages:[]};
 const state=async()=>{const raw=randomBytes(32).toString('base64url');await store.createState({...f.contexts[0],appId:'123',state:raw,callbackUrl:'https://example.test/callback'});return(await store.consumeState(raw))!;};
 const advance=async(at:Date,n=ns,user=userId)=>f.db.$transaction((tx:any)=>fence.advance(tx,n,user,at));
 try{await run(f,{store,state,grant,advance});}finally{await f.db.metaInboxGrantFence.deleteMany({where:{subjectHash:fence.subjectHash(ns,userId)}});}
});}

test('facebookLateGrantCannotRestoreConsentCoveredByDeletionFence',async()=>fixture(async(f,s)=>{
 const saved=await s.state(),before=await f.snapshot();await s.advance(new Date(Date.now()+1000));
 await assert.rejects(s.store.saveGrant(saved,s.grant));
 assert.equal(await f.db.facebookManagementConnection.count({where:{workspaceId:f.workspaceIds[0],providerUserId:s.grant.providerUserId}}),0);assert.deepEqual(await f.snapshot(),before);
}));

test('facebookFreshGrantRecordsOriginalOAuthStartRatherThanTokenSaveTime',async()=>fixture(async(f,s)=>{
 await s.advance(new Date(Date.now()-60000));const saved=await s.state();assert.ok(saved.createdAt instanceof Date);
 const id=await s.store.saveGrant(saved,s.grant),c=await f.db.facebookManagementConnection.findUniqueOrThrow({where:{id}});
 assert.equal(c.authorizationStartedAt?.getTime(),saved.createdAt.getTime());assert.ok(c.authorizedAt instanceof Date);
}));

test('facebookFenceDoesNotBlockAnotherProviderUser',async()=>fixture(async(f,s)=>{
 const saved=await s.state();await s.advance(new Date(Date.now()+1000));const id=await s.store.saveGrant(saved,{...s.grant,providerUserId:'201'});assert.ok(id);
}));
