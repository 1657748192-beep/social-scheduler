import test from 'node:test';import assert from 'node:assert/strict';
import {createInstagramGrantInspector} from '../src/instagramManagement/grantInspection';
import type {InstagramInspectionContext} from '../src/instagramManagement/types';
const config={enabled:true,appId:'456',appSecret:'private-app-secret',graphVersion:'v25.0',callbackUrl:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',requiredScopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages']};
const now=()=>new Date('2026-01-02T00:00:00Z');
const context=():InstagramInspectionContext&{connection:{authorizedAt:Date|null;authorizationStartedAt:Date|null}}=>({connection:{id:'connection',appId:'456',providerAccountId:'100',providerUserId:'200',version:3,scopes:[...config.requiredScopes],expiresAt:new Date('2026-01-03T00:00:00Z'),authorizedAt:new Date('2026-01-01T12:00:00Z'),authorizationStartedAt:new Date('2026-01-01T11:59:00Z')},capability:'messages.read'});

test('legacyTokenWithoutConfirmedIndependentConsentCannotAcquireCurrentCapability',async()=>{
 let calls=0;const inspect=createInstagramGrantInspector({config,now,fetchImpl:async input=>{calls++;return Response.json(new URL(String(input)).pathname.endsWith('/me')?{id:'200',user_id:'100',account_type:'BUSINESS'}:{data:[]});}});
 for(const patch of [{authorizedAt:null},{authorizationStartedAt:null},{authorizedAt:new Date('2026-01-04T00:00:00Z')},{authorizationStartedAt:new Date('2026-01-01T13:00:00Z')},{expiresAt:new Date('2026-01-01T10:00:00Z')}])await assert.rejects(inspect('100','private-independent-token',{...context(),connection:{...context().connection,...patch}}));
 assert.equal(calls,0);
});

test('currentMessagingProbeAcceptsOpaqueConversationIdsWithoutReadingMessageBodies',async()=>{
 const seen:string[]=[];const inspect=createInstagramGrantInspector({config,now,fetchImpl:async(input,init)=>{
  const u=new URL(String(input));assert.equal(u.hostname,'graph.instagram.com');assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(u.searchParams.get('fields'),u.pathname.endsWith('/me')?'id,user_id,account_type':'id');assert.equal(u.searchParams.get('access_token'),null);seen.push(u.pathname);
  return Response.json(u.pathname.endsWith('/me')?{id:'200',user_id:'100',account_type:'BUSINESS'}:{data:[{id:'aWdfY29udmVyc2F0aW9u:123'}]});
 }});
 const proof=await inspect('100','private-independent-token',context());assert.deepEqual(proof.scopes,['instagram_business_basic','instagram_business_manage_messages']);assert.deepEqual(seen,['/v25.0/me','/v25.0/100/conversations']);
});

test('providerErrorCannotMasqueradeAsASuccessfulEmptyPermissionProbe',async()=>{
 const inspect=createInstagramGrantInspector({config,now,fetchImpl:async(input)=>Response.json(new URL(String(input)).pathname.endsWith('/me')?{id:'200',user_id:'100',account_type:'BUSINESS'}:{data:[],error:{code:200,message:'private-provider-body'}})});
 await assert.rejects(inspect('100','private-independent-token',context()),e=>!String(e).includes('private-provider-body')&&!String(e).includes('private-independent-token'));
});

test('unboundExpiredMissingOrForeignOAuthEvidenceDoesNotCallProvider',async()=>{
 let calls=0;const inspect=createInstagramGrantInspector({config,now,fetchImpl:async()=>{calls++;throw Error();}});
 for(const c of [undefined,{...context(),connection:{...context().connection,appId:'999'}},{...context(),connection:{...context().connection,providerAccountId:'999'}},{...context(),connection:{...context().connection,expiresAt:null}},{...context(),connection:{...context().connection,expiresAt:now()}},{...context(),connection:{...context().connection,scopes:['instagram_business_basic']}},{...context(),capability:'mentions.read' as const}])await assert.rejects(inspect('100','private-independent-token',c));
 assert.equal(calls,0);
});

test('basicIdentitySuccessDoesNotGrantCommentsWithoutAnOwnedMediaProbe',async()=>{
 const c=context();c.capability='comments.read';let calls=0;
 const inspect=createInstagramGrantInspector({config,now,fetchImpl:async input=>{calls++;return Response.json(new URL(String(input)).pathname.endsWith('/me')?{id:'200',user_id:'100',account_type:'BUSINESS'}:{data:[]});}});
 await assert.rejects(inspect('100','private-independent-token',c));assert.equal(calls,2);
});

test('differentOAuthSubjectAndPermissionDenialRemainUnavailable',async()=>{
 for(const mode of ['wrong-subject','wrong-account','consumer','permission-denied','malformed','redirect','oversize','transport']){
  let calls=0;const inspect=createInstagramGrantInspector({config,now,fetchImpl:async()=>{
   calls++;if(mode==='transport')throw Error('private-independent-token');
   if(calls===1)return Response.json({id:mode==='wrong-subject'?'999':'200',user_id:mode==='wrong-account'?'999':'100',account_type:mode==='consumer'?'PERSONAL':'BUSINESS'});
   if(mode==='redirect')return new Response('',{status:302,headers:{location:'https://evil.test'}});
   if(mode==='oversize')return new Response('x'.repeat(1048577));
   if(mode==='malformed')return Response.json({data:'wrong'});
   return new Response(JSON.stringify({error:{code:200}}),{status:403});
  }});
  await assert.rejects(inspect('100','private-independent-token',context()),e=>!String(e).includes('private-independent-token'));
 }
});
