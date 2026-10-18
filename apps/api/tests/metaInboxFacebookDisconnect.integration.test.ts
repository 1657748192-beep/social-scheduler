import test from 'node:test';import assert from 'node:assert/strict';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';import {createFacebookManagementRuntime} from '../src/facebookManagement/runtime';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
const runtime=(f:any,encrypt=encryptToken)=>createFacebookManagementRuntime({db:f.db,settings:{enabled:true,appId:'123',graphVersion:'v25.0',loginConfigId:'999',callbackUrl:'https://example.test/api/v1/integrations/facebook-management/oauth/callback'},appSecret:'synthetic-facebook-secret',encrypt,decrypt:decryptToken,fetchImpl:async()=>{throw Error('No provider I/O allowed');}});

test('facebookDisconnectPinsEachManagedPageWithoutTouchingPublishing',async()=>withFacebookManagementFixture(async f=>{
 await f.db.facebookManagedPage.create({data:{connectionId:f.connections[0].id,pageId:'101',name:'Synthetic second Page',pageTokenEncrypted:'sealed:second',tasks:['MANAGE'],scopes:f.scopes}});
 const before=await f.snapshot();assert.deepEqual(await runtime(f).disconnect(f.contexts[0],f.connections[0].id),{disconnected:true});
 const c=await f.db.facebookManagementConnection.findUniqueOrThrow({where:{id:f.connections[0].id}});assert.equal(c.status,'disconnected');assert.equal(c.version,2);assert.equal(c.userTokenEncrypted,null);
 const jobs=await f.db.metaInboxDeletionRequest.findMany({where:{workspaceId:f.workspaceIds[0]}});assert.equal(jobs.length,2);assert.ok(jobs.every((r:any)=>r.reason==='connection_disconnected'));assert.deepEqual(await f.snapshot(),before);
 assert.equal((await f.db.facebookManagementConnection.findUniqueOrThrow({where:{id:f.connections[1].id}})).status,'active');
}));

test('failedFacebookDisconnectAdmissionRollsBackTokensPagesAndSelectionsTogether',async()=>withFacebookManagementFixture(async f=>{
 const state=async()=>({connection:await f.db.facebookManagementConnection.findUniqueOrThrow({where:{id:f.connections[0].id}}),pages:await f.db.facebookManagedPage.findMany({where:{connectionId:f.connections[0].id},orderBy:{id:'asc'}}),selections:await f.db.facebookManagementPageSelection.findMany({where:{workspaceId:f.workspaceIds[0]},orderBy:{id:'asc'}})}),before=await state();
 await assert.rejects(runtime(f,()=>{throw Error('Synthetic encryption failure');}).disconnect(f.contexts[0],f.connections[0].id));assert.deepEqual(await state(),before);assert.equal(await f.db.metaInboxDeletionRequest.count({where:{workspaceId:f.workspaceIds[0]}}),0);assert.equal(await f.db.metaInboxDeletionMarker.count({where:{workspaceId:f.workspaceIds[0]}}),0);
}));
