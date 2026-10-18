import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';import {seedDeletionCustomer} from './helpers/metaInboxDeletionFixture';import {createMetaInboxDeletion} from '../src/interactionInbox/deletion';import {encryptToken,decryptToken} from '../src/utils/tokenCrypto';
import {createFacebookManagementRuntime} from '../src/facebookManagement/runtime';

test('closedPublicCallbacksStillProcessExistingFacebookDisconnectCleanup',async()=>withMetaInboxFixture(async f=>{
 const c=await f.seedVerifiedCase(),workspaceId=f.adminCtx.workspaceId;
 const source={...(c.sourceRef as any),platform:'facebook'};await f.db.interactionCase.update({where:{id:c.id},data:{sourceRef:source}});
 await f.db.facebookInteractionMessage.create({data:{managedPageId:f.pages[0].id,connectionVersion:1,providerId:'message-existing',participantId:'300',senderId:'300',recipientId:'100',text:'Synthetic incoming',occurredAt:new Date()}});
 await f.db.interactionItem.create({data:{workspaceId,assetId:c.assetId,caseId:c.id,platform:'facebook',providerEventId:'message-existing',direction:'inbound',occurredAt:new Date(),sourceRef:source}});
 const note=await f.db.customerNote.create({data:{workspaceId,customerId:c.customerId!,authorId:f.userId,text:'Covered synthetic note'}});
 const runtime=createFacebookManagementRuntime({db:f.db,settings:{enabled:true,appId:'123',graphVersion:'v25.0',loginConfigId:'999',callbackUrl:'https://example.test/api/v1/integrations/facebook-management/oauth/callback'},appSecret:'synthetic-facebook-secret',encrypt:encryptToken,decrypt:decryptToken,fetchImpl:async()=>{throw Error('No provider I/O');}});
 await runtime.disconnect(f.adminCtx,f.connections[0].id);
 const receipt=await f.db.metaInboxDeletionRequest.findFirstOrThrow({where:{workspaceId,platform:'facebook'}}),before=await f.publishingSnapshot(),env=require('../../../scripts/run-tests.cjs').environment(true,true);
 const child=fork(path.resolve('apps/api/tests/fixtures/metaLifecycleServer.ts'),[],{execArgv:['--import',pathToFileURL(require.resolve('tsx')).href],stdio:['ignore','ignore','ignore','ipc'],env:{...env,DATABASE_URL:env.FACEBOOK_TEST_DATABASE_URL,REDIS_URL:env.LOCAL_UPLOAD_TEST_REDIS_URL,FACEBOOK_MANAGEMENT_ENABLED:'true',FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID:'999',FACEBOOK_MANAGEMENT_GRAPH_API_VERSION:'v25.0',FACEBOOK_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/facebook-management/oauth/callback',INSTAGRAM_MANAGEMENT_ENABLED:'false',META_INBOX_DELETION_ENABLED:'false',API_PUBLIC_URL:'https://example.test',FACEBOOK_CLIENT_ID:'123',FACEBOOK_CLIENT_SECRET:'synthetic-facebook-secret',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-instagram-secret'}});
 try{
  const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API fixture unavailable')),15000);child.once('message',(m:any)=>{clearTimeout(timer);resolve(m.port);});child.once('exit',()=>{clearTimeout(timer);reject(Error('API fixture exited'));});});
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/meta-lifecycle/facebook/status/not-real`)).status,404);
  const until=Date.now()+60000;let complete=false;while(Date.now()<until){complete=(await f.db.metaInboxDeletionRequest.findUniqueOrThrow({where:{id:receipt.id}})).status==='completed';if(complete)break;await new Promise(resolve=>setTimeout(resolve,40));}
  assert.equal(complete,true,'API-owned cleanup must complete without a manual purge');
  assert.equal(await f.db.customerNote.findUnique({where:{id:note.id}}),null);assert.deepEqual(await f.publishingSnapshot(),before);
 }finally{if(child.exitCode===null){if(child.connected)child.send('stop');await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}}
}));

test('actualApiServerPurgesAdmittedSourcesAndCoveredNotesWithoutAnAdminVisit',async()=>withMetaInboxFixture(async f=>{
 const own=await seedDeletionCustomer(f),before=await f.publishingSnapshot(),d=createMetaInboxDeletion({db:f.db,encrypt:encryptToken,decrypt:decryptToken}),receipt=await d.disconnect({workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',connectionId:f.instagramConnectionIds[0],connectionVersion:1});
 const expired=await f.db.instagramInteractionEvent.create({data:{workspaceId:f.foreignCtx.workspaceId,connectionId:f.instagramConnectionIds[1],connectionVersion:1,eventKey:'expired-independent-raw',payload:{synthetic:true},receivedAt:new Date(Date.now()-8*86400000)}});
 const env=require('../../../scripts/run-tests.cjs').environment(true,true),child=fork(path.resolve('apps/api/tests/fixtures/metaLifecycleServer.ts'),[],{execArgv:['--import',pathToFileURL(require.resolve('tsx')).href],stdio:['ignore','ignore','ignore','ipc'],env:{...env,DATABASE_URL:env.FACEBOOK_TEST_DATABASE_URL,REDIS_URL:env.LOCAL_UPLOAD_TEST_REDIS_URL,FACEBOOK_MANAGEMENT_ENABLED:'false',INSTAGRAM_MANAGEMENT_ENABLED:'false',META_INBOX_DELETION_ENABLED:'true',API_PUBLIC_URL:'https://example.test',FACEBOOK_CLIENT_ID:'123',FACEBOOK_CLIENT_SECRET:'synthetic-facebook-secret',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-instagram-secret'}});
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API fixture unavailable')),15000);child.once('message',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>{clearTimeout(timer);reject(Error('API fixture exited'));});});
  const until=Date.now()+60000;while(Date.now()<until&&await d.status(receipt.confirmationCode)!=='completed')await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(await d.status(receipt.confirmationCode),'completed');assert.equal(await f.db.instagramInteractionMessage.count({where:{connectionId:f.instagramConnectionIds[0]}}),0);assert.equal(await f.db.interactionCustomer.findUnique({where:{id:own.customer.id}}),null);assert.equal(await f.db.instagramInteractionEvent.findUnique({where:{id:expired.id}}),null);assert.deepEqual(await f.publishingSnapshot(),before);
 }finally{if(child.exitCode===null){if(child.connected)child.send('stop');await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}}
}));
