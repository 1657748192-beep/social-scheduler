import test from 'node:test';
import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';
import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';

test('deletionClaimsAreExclusiveScopedAndRecoverExpiredLeases',async()=>withMetaInboxFixture(async f=>{
 const d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken});
 const a={workspaceId:f.adminCtx.workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1};
 const receipt=await d.markActor(a,'300'),now=new Date(Date.now()+1000);
 const [first,second]=await Promise.all([d.claimMaintenance({platform:'instagram',appId:'456'},now),d.claimMaintenance({platform:'instagram',appId:'456'},now)]);
 const claims=[first,second].filter(Boolean);assert.equal(claims.length,1);assert.equal(claims[0]!.confirmationCode,receipt.confirmationCode);
 assert.equal(await d.claimMaintenance({platform:'instagram',appId:'999'},new Date(now.getTime()+60000)),null);
 const recovered=await d.claimMaintenance({platform:'instagram',appId:'456'},new Date(now.getTime()+60000));assert.ok(recovered);assert.notEqual(recovered.claimToken,claims[0]!.claimToken);
 assert.equal(await d.releaseMaintenance(claims[0]!,now,false),false);
 assert.equal(await d.releaseMaintenance(recovered,new Date(now.getTime()+60000),false),true);
}));

test('successfulBoundedMaintenanceDoesNotExhaustRetryBudget',async()=>withMetaInboxFixture(async f=>{
 const d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken});
 const a={workspaceId:f.adminCtx.workspaceId,platform:'instagram' as const,appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1};
 const receipt=await d.markActor(a,'300');let now=new Date(Date.now()+1000);
 for(let i=0;i<10;i++){const claim=await d.claimMaintenance({platform:'instagram',appId:'456'},now);assert.ok(claim);assert.equal(await d.releaseMaintenance(claim,now,false),true);now=new Date(now.getTime()+60000);}
 for(let i=0;i<8;i++){const claim=await d.claimMaintenance({platform:'instagram',appId:'456'},now);assert.ok(claim);assert.equal(await d.releaseMaintenance(claim,now,true),true);now=new Date(now.getTime()+86400000);}
 assert.equal(await d.claimMaintenance({platform:'instagram',appId:'456'},now),null);
 assert.equal(await d.status(receipt.confirmationCode),'pending');
}));
