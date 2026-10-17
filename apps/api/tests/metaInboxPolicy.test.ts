import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveInboxPolicy,parseLiveAssetRules,type LiveAssetRule} from '../src/interactionInbox/livePolicy';
import {createInboxProjection} from '../src/interactionInbox/projection';
import {createInboxAccess} from '../src/interactionInbox/access';

const key={workspaceId:'11111111-1111-4111-8111-111111111111',platform:'facebook' as const,appId:'123',providerAssetId:'100'};
const rule:LiveAssetRule={...key,readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2026-10-17T00:00:00.000Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}};
const now=()=>new Date('2026-10-17T12:00:00.000Z');
const denied=(e:any)=>e.statusCode===409;

test('missingPolicyMakesNoProviderOrDbWrite',async()=>{
 let calls=0;const deps=new Proxy({}, {get(){calls++;throw Error('must not reach dependencies');}});
 const projection=createInboxProjection({db:deps as any,access:deps as any,policy:createLiveInboxPolicy([],now)} as any);
 await assert.rejects(projection.projectVerifiedPage({workspaceId:key.workspaceId} as any,{platform:key.platform,appNamespace:key.appId,providerAssetId:key.providerAssetId} as any,{items:[],nextCursor:null,coverage:'synthetic',warnings:[]}),denied);
 assert.equal(calls,0);
});
test('sendGateIndependentOfRead',()=>{
 const p=createLiveInboxPolicy([rule],now);
 assert.equal(p.requireAsset(key,'read').contentRetentionDays,90);
 assert.throws(()=>p.requireAsset(key,'send'),denied);
 assert.throws(()=>createLiveInboxPolicy([{...rule,readEnabled:false,sendEnabled:true}],now).requireAsset(key,'send'),denied);
});
test('sameNameDifferentAppDenied',()=>{
 const p=createLiveInboxPolicy([rule],now);
 for(const other of [{...key,appId:'124'},{...key,providerAssetId:'101'},{...key,platform:'instagram' as const},{...key,workspaceId:'22222222-2222-4222-8222-222222222222'}])assert.throws(()=>p.requireAsset(other,'read'),denied);
});
test('unreviewedAndFuturePolicyCannotEnableRead',()=>{
 for(const policy of [{...rule.policy,reviewed:false},{...rule.policy,checkedAt:'2026-10-18T00:00:00Z'}])assert.throws(()=>createLiveInboxPolicy([{...rule,policy}],now).requireAsset(key,'read'),denied);
});
test('officialEvidenceAndBoundedPolicyAreRequired',()=>{
 const invalid=[{sources:[]},{sources:['http://developers.facebook.com/docs/']},{sources:['https://developers.facebook.com.evil.test/docs/']},{sources:['https://www.postman.com/stranger/instagram/']},{sources:['https://developers.facebook.com@evil.test/']},{checkedAt:'not-a-date'},{graphVersion:'latest'},{rawRetentionDays:8},{rawRetentionDays:0},{contentRetentionDays:91},{contentRetentionDays:0},{replyWindowMs:0}];
 for(const patch of invalid)assert.throws(()=>createLiveInboxPolicy([{...rule,policy:{...rule.policy,...patch}}] as any,now));
 assert.equal(createLiveInboxPolicy([{...rule,policy:{...rule.policy,sources:['https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api']}}],now).requireAsset(key,'read').rawRetentionDays,7);
});
test('serverConfigDefaultsClosedAndNeverEchoesMalformedValue',()=>{
 assert.deepEqual(parseLiveAssetRules(undefined),[]);
 assert.deepEqual(parseLiveAssetRules(''),[]);
 for(const raw of ['SECRET-DO-NOT-ECHO','{}','[null]'])assert.throws(()=>parseLiveAssetRules(raw),e=>!String(e).includes(raw)&&String(e).includes('Invalid live inbox configuration'));
});
test('duplicateRulesRejectedAndInputCannotMutatePolicy',()=>{
 assert.throws(()=>createLiveInboxPolicy([rule,rule],now));
 const mutable=structuredClone(rule),p=createLiveInboxPolicy([mutable],now);
 mutable.sendEnabled=true;mutable.policy.sources.length=0;
 const result=p.requireAsset(key,'read');result.contentRetentionDays=1;
 assert.equal(p.requireAsset(key,'read').contentRetentionDays,90);
 assert.throws(()=>p.requireAsset(key,'send'),denied);
});
test('missingAssetRuleBlocksProviderVerificationAndSendGate',async()=>{
 let providerCalls=0;
 const db:any={userSession:{findFirst:async()=>({id:'session'})},workspaceMember:{findFirst:async()=>({role:'owner'})},user:{findUnique:async()=>({email:'admin@example.test'})},socialAccount:{findFirst:async()=>({platform:'facebook',status:'active',providerAccountId:'100',accountType:'page'})},facebookManagementPageSelection:{findUnique:async()=>({page:{id:'22222222-2222-4222-8222-222222222222',pageId:'100',active:true,pageTokenEncrypted:'sealed',tasks:['MODERATE'],connection:{id:'33333333-3333-4333-8333-333333333333',workspaceId:key.workspaceId,userId:'admin',appId:'123',status:'active',version:1,userTokenEncrypted:'sealed'}}})}};
 const {config}=await import('../src/config');const old=config.ADMIN_EMAILS;config.ADMIN_EMAILS='admin@example.test';
 try{
  const access=createInboxAccess({db,facebookEnabled:true,policy:createLiveInboxPolicy([],now),verifyFacebook:async()=>{providerCalls++;return{readMessages:{status:'available'}};}} as any);
  await assert.rejects(access.resolveInboxAsset({workspaceId:key.workspaceId,userId:'admin',sessionId:'session'},'account','messages.read'),denied);
  assert.equal(providerCalls,0);
 }finally{config.ADMIN_EMAILS=old;}
});
