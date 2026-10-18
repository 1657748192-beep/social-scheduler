import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {createInstagramSendExecutor} from '../src/instagramManagement/sendAttempts';
function input(f:any,patch:Record<string,unknown>={}){return{asset:{ctx:f.adminCtx,accountId:f.instagramAccountIds[0],platform:'instagram',appNamespace:'456',providerAssetId:'100',connectionVersion:1,sourceRef:{platform:'instagram',instagramAccountId:f.instagramAccountIds[0],connectionId:f.instagramConnectionIds[0],connectionVersion:1}},requestKey:randomUUID(),kind:'message',targetId:'300',text:'Synthetic reply',...patch} as any;}
test('concurrentSameKeyOneProviderCall',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot(),executor=createInstagramSendExecutor({db:f.db}),i=input(f);let sends=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const first=executor.execute(i,async()=>{sends++;await gate;return{status:'sent',providerId:'sent-1'};});
 while(!sends)await new Promise(r=>setTimeout(r,5));
 assert.equal((await executor.execute(i,async()=>{sends++;return{status:'sent',providerId:'duplicate'};})).status,'unknown');release();assert.deepEqual(await first,{status:'sent',providerId:'sent-1'});
 assert.deepEqual(await executor.execute(i,async()=>{throw Error('must not resend');}),{status:'sent',providerId:'sent-1'});assert.equal(sends,1);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('differentPayloadSameKey409',async()=>withMetaInboxFixture(async f=>{
 const executor=createInstagramSendExecutor({db:f.db}),i=input(f);await executor.execute(i,async()=>({status:'sent',providerId:'sent-1'}));
 await assert.rejects(executor.execute({...i,text:'Changed'},async()=>({status:'sent',providerId:'bad'})),(e:any)=>e.statusCode===409);
 await assert.rejects(executor.execute({...i,targetId:'301'},async()=>({status:'sent',providerId:'bad'})),(e:any)=>e.statusCode===409);
}));
test('timeoutBecomesUnknownAndNoRetry',async()=>withMetaInboxFixture(async f=>{
 const executor=createInstagramSendExecutor({db:f.db}),i=input(f);let sends=0;const result=await executor.execute(i,async()=>{sends++;throw Error('private transport error');});assert.equal(result.status,'unknown');
 assert.deepEqual(await executor.execute(i,async()=>{sends++;return{status:'sent',providerId:'bad'};}),result);assert.equal(sends,1);assert.doesNotMatch(JSON.stringify(result),/private/);
}));
test('explicitFailureIsNotSent',async()=>withMetaInboxFixture(async f=>{
 const executor=createInstagramSendExecutor({db:f.db}),i=input(f);const result=await executor.execute(i,async()=>({status:'failed',code:'provider_rejected',diagnosticId:randomUUID()}));assert.equal(result.status,'failed');
 assert.deepEqual(await executor.execute(i,async()=>{throw Error('must not resend');}),result);
}));
test('revokedBeforeDispatchNeverSendsAndAppNamespaceCannotCross',async()=>withMetaInboxFixture(async f=>{
 const executor=createInstagramSendExecutor({db:f.db}),i=input(f);let sends=0;const send=async()=>{sends++;return{status:'sent' as const,providerId:'bad'};};
 await assert.rejects(executor.execute({...i,asset:{...i.asset,appNamespace:'999'}},send));
 await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{status:'inactive'}});await assert.rejects(executor.execute(i,send));assert.equal(sends,0);
}));
test('invalidAndOversizedRepliesDoNotCreateAttempts',async()=>withMetaInboxFixture(async f=>{
 const executor=createInstagramSendExecutor({db:f.db});for(const patch of [{text:' '},{text:'x'.repeat(2001)},{requestKey:'not-uuid'},{targetId:'100'}])await assert.rejects(executor.execute(input(f,patch),async()=>({status:'sent',providerId:'bad'})));
 assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{workspaceId:f.adminCtx.workspaceId}}),0);
}));
test('accountSelectionRestrictionCannotBeBypassedAtDispatch',async()=>withMetaInboxFixture(async f=>{
 const executor=createInstagramSendExecutor({db:f.db}),i=input(f);let calls=0;
 await assert.rejects(executor.execute({...i,asset:{...i.asset,ctx:{...i.asset.ctx,accountIds:[f.instagramAccountIds[1]]}}},async()=>{calls++;return{status:'sent',providerId:'bad'};}));
 assert.equal(calls,0);
}));
test('lateProviderSuccessAfterDisconnectIsUnknownWithoutCredentialMutation',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot(),executor=createInstagramSendExecutor({db:f.db}),i=input(f);
 const result=await executor.execute(i,async()=>{
  await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{status:'inactive',version:{increment:1}}});
  return{status:'sent',providerId:'late-success'};
 });
 assert.equal(result.status,'unknown');const row=await f.db.instagramInteractionSendAttempt.findFirst({where:{connectionId:f.instagramConnectionIds[0],requestKey:i.requestKey}});assert.equal(row?.status,'unknown');assert.equal(row?.providerId,null);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('sameActorAndRequestKeyInDifferentAppsRemainSeparate',async()=>withMetaInboxFixture(async f=>{
 const executor=createInstagramSendExecutor({db:f.db}),i=input(f),original=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});
 const other=await f.db.instagramManagementConnection.create({data:{workspaceId:original.workspaceId,userId:original.userId,appId:'999',providerAccountId:'100',providerUserId:'200',tokenEncrypted:'sealed:other-app',status:'active',scopes:original.scopes}});
 const second={...i,asset:{...i.asset,appNamespace:'999',sourceRef:{...i.asset.sourceRef,connectionId:other.id}}};let calls=0;
 assert.deepEqual(await executor.execute(i,async()=>{calls++;return{status:'sent',providerId:'app-a'};}),{status:'sent',providerId:'app-a'});
 assert.deepEqual(await executor.execute(second,async()=>{calls++;return{status:'sent',providerId:'app-b'};}),{status:'sent',providerId:'app-b'});assert.equal(calls,2);
 assert.equal(await f.db.instagramInteractionSendAttempt.count({where:{workspaceId:original.workspaceId,requestKey:i.requestKey}}),2);
}));
