import test from 'node:test';import assert from 'node:assert/strict';
import {withMetaInboxFixture,type MetaInboxFixture} from './helpers/metaInboxFixture';
import {createInstagramManagementOAuth} from '../src/instagramManagement/oauth';
import {createInstagramManagementStore} from '../src/instagramManagement/store';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import {getInstagramManagementConfig} from '../src/instagramManagement/config';
import {createInstagramManagementGateway} from '../src/instagramManagement/oauthGateway';
const scopes=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
function service(f:MetaInboxFixture,exchange?:any,providerAccountId='100'){
 const config=getInstagramManagementConfig({INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-secret',API_PUBLIC_URL:'https://app.example.test',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://app.example.test/api/v1/integrations/instagram-management/oauth/callback',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',INSTAGRAM_MANAGEMENT_SCOPES:scopes.join(',')});
 const policy=createLiveInboxPolicy(f.workspaceIds.map(workspaceId=>({workspaceId,platform:'instagram',appId:'456',providerAssetId:providerAccountId,readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}})));
 const grant={appId:'456',providerAccountId:'100',providerUserId:'200',accessToken:'independent-new-token',scopes,expiresAt:new Date(Date.now()+86400000),displayName:'Synthetic IG'};
 const store=createInstagramManagementStore({db:f.db,encrypt:v=>'sealed:'+v,policy});
 return{config,store,grant,oauth:createInstagramManagementOAuth({db:f.db,config,policy,store,exchange:exchange??(async()=>grant)})};
}
async function start(f:MetaInboxFixture,s:ReturnType<typeof service>){const r=await s.oauth.start(f.adminCtx,f.instagramAccountIds[0]);return new URL(r.authorizationUrl).searchParams.get('state')!;}

test('actualGatewayStoresExactLargeIndependentIdentityWithoutChangingPublishing',async()=>withMetaInboxFixture(async f=>{
 const exact='17841414555024979';await f.db.socialAccount.update({where:{id:f.instagramAccountIds[0]},data:{providerAccountId:exact}});
 const before=await f.publishingSnapshot();let calls=0;
 const fetchImpl:typeof fetch=async input=>{calls++;const u=new URL(String(input));
  if(u.hostname==='api.instagram.com')return new Response('{"data":[{"access_token":"short-private","user_id":17841414555024979,"permissions":"instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages"}]}');
  if(u.pathname==='/access_token')return Response.json({access_token:'independent-long-private',expires_in:5184000});
  return new Response('{"id":17841414555024979,"user_id":17841414555024979,"username":"synthetic","account_type":"BUSINESS"}');
 };
 const s=service(f,(code:string,callback:string)=>createInstagramManagementGateway({config:s.config,fetchImpl}).exchange(code,callback),exact);
 const state=await start(f,s),result=await s.oauth.callback({state,code:'one-use-code'});
 const row=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:result.connectionId}});
 assert.equal(calls,3);assert.equal(row.providerAccountId,exact);assert.equal(row.providerUserId,exact);assert.equal(row.tokenEncrypted,'sealed:independent-long-private');assert.deepEqual(row.scopes,scopes);assert.ok(row.authorizedAt&&row.authorizationStartedAt);assert.equal(row.notificationsEnabled,false);
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('wrongAccountNoGrantSaved',async()=>withMetaInboxFixture(async f=>{
 const s=service(f,async()=>({...service(f).grant,providerAccountId:'999'})),before=await f.publishingSnapshot(),c=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});
 const state=await start(f,s);await assert.rejects(s.oauth.callback({state,code:'code'}));
 assert.deepEqual(await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:c.id}}),c);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('cancelConsumesState',async()=>withMetaInboxFixture(async f=>{
 let exchanges=0;const s=service(f,async()=>{exchanges++;return service(f).grant;}),state=await start(f,s);
 await assert.rejects(s.oauth.callback({state,error:'access_denied'}));await assert.rejects(s.oauth.callback({state,code:'late-code'}));assert.equal(exchanges,0);
 assert.equal(await f.db.instagramManagementOAuthState.count({where:{workspaceId:f.adminCtx.workspaceId,consumedAt:{not:null}}}),1);
}));
test('callbackAfterSessionRevokedDenied',async()=>withMetaInboxFixture(async f=>{
 let exchanges=0;const s=service(f,async()=>{exchanges++;return service(f).grant;}),state=await start(f,s),before=await f.publishingSnapshot();
 await f.db.userSession.update({where:{id:f.sessionId},data:{revokedAt:new Date()}});await assert.rejects(s.oauth.callback({state,code:'code'}));assert.equal(exchanges,0);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('concurrentReplayOneWinner',async()=>withMetaInboxFixture(async f=>{
 let exchanges=0;const s=service(f,async()=>{exchanges++;await new Promise(r=>setTimeout(r,20));return service(f).grant;}),state=await start(f,s),before=await f.publishingSnapshot();
 const out=await Promise.allSettled([s.oauth.callback({state,code:'code'}),s.oauth.callback({state,code:'code'})]);
 assert.equal(out.filter(r=>r.status==='fulfilled').length,1);assert.equal(exchanges,1);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('actualGrantsNotRequestedScopes',async()=>withMetaInboxFixture(async f=>{
 const s=service(f,async()=>({...service(f).grant,scopes:['instagram_business_basic']})),state=await start(f,s),before=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});
 await assert.rejects(s.oauth.callback({state,code:'code'}));assert.deepEqual(await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:before.id}}),before);
}));
test('independentConsentPreservesPublishingSnapshot',async()=>withMetaInboxFixture(async f=>{
 const s=service(f),before=await f.publishingSnapshot(),state=await start(f,s);const saved=await f.db.instagramManagementOAuthState.findFirstOrThrow({where:{workspaceId:f.adminCtx.workspaceId}});
 assert.notEqual(saved.stateHash,state);assert.equal(saved.sessionId,f.sessionId);assert.equal(saved.accountId,f.instagramAccountIds[0]);assert.ok(saved.expiresAt.getTime()-saved.createdAt.getTime()<=600000);
 const result=await s.oauth.callback({state,code:'code'}),row=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:result.connectionId}});
 assert.equal(row.tokenEncrypted,'sealed:independent-new-token');assert.equal(row.version,2);assert.deepEqual(row.scopes,scopes);assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('onlySuccessfulIndependentConsentRecordsAuthorizationEpoch',async()=>withMetaInboxFixture(async f=>{
 const old=new Date('2020-01-01T00:00:00Z');await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{authorizedAt:old}});
 const s=service(f),before=await f.publishingSnapshot(),state=await start(f,s),earliest=Date.now();
 const result=await s.oauth.callback({state,code:'code'}),row=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:result.connectionId}});
 assert.ok(row.authorizedAt&&row.authorizedAt.getTime()>=earliest&&row.authorizedAt.getTime()<=Date.now(),'new consent must have its own server-recorded epoch, not inherit the old grant');
 const invalid=service(f,async()=>({...service(f).grant,providerAccountId:'999'})),bad=await start(f,invalid);await assert.rejects(invalid.oauth.callback({state:bad,code:'bad'}));
 assert.equal((await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:row.id}})).authorizedAt?.getTime(),row.authorizedAt.getTime());assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('expiredStateAndForeignAppNeverExchange',async()=>withMetaInboxFixture(async f=>{
 let exchanges=0;const s=service(f,async()=>{exchanges++;return service(f).grant;}),state=await start(f,s);
 await f.db.instagramManagementOAuthState.updateMany({where:{workspaceId:f.adminCtx.workspaceId},data:{expiresAt:new Date(0)}});await assert.rejects(s.oauth.callback({state,code:'code'}));assert.equal(exchanges,0);
 const second=await start(f,s);await f.db.instagramManagementOAuthState.updateMany({where:{workspaceId:f.adminCtx.workspaceId,consumedAt:null},data:{appId:'999'}});await assert.rejects(s.oauth.callback({state:second,code:'code'}));assert.equal(exchanges,0);
}));
test('ordinaryCustomerCannotStartIndependentAuthorization',async()=>withMetaInboxFixture(async f=>{
 const s=service(f),ctx={...f.viewerCtx,workspaceId:f.adminCtx.workspaceId};await assert.rejects(s.oauth.start(ctx,f.instagramAccountIds[0]));assert.equal(await f.db.instagramManagementOAuthState.count({where:{workspaceId:ctx.workspaceId}}),0);
}));
test('revocationDuringExchangeCannotSaveLateToken',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot(),connection=await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:f.instagramConnectionIds[0]}});
 const s=service(f,async()=>{await f.db.userSession.update({where:{id:f.sessionId},data:{revokedAt:new Date()}});return service(f).grant;}),state=await start(f,s);
 await assert.rejects(s.oauth.callback({state,code:'code'}));assert.deepEqual(await f.db.instagramManagementConnection.findUniqueOrThrow({where:{id:connection.id}}),connection);assert.deepEqual(await f.publishingSnapshot(),before);
}));
test('providerFailureNeverLeaksTokenOrFallsBackToPublishing',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot(),s=service(f,async()=>{throw Error('private-app-secret private-token oauth-code');}),state=await start(f,s);
 await assert.rejects(s.oauth.callback({state,code:'oauth-code'}),e=>!String(e).includes('private-token')&&!String(e).includes('oauth-code')&&!String(e).includes('private-app-secret'));assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('failedCallbackReportsOnlyItsFixedStageAndLeavesPublishingUntouched',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot(),s=service(f,async()=>{throw Error('private-token oauth-code private-app-secret');}),state=await start(f,s);
 const original=console.warn,lines:string[]=[];console.warn=(...values)=>{lines.push(values.join(' '));};
 try{await assert.rejects(s.oauth.callback({state,code:'oauth-code'}));assert.deepEqual(lines,['IG_MANAGEMENT_CALLBACK_FAILURE exchange']);}
 finally{console.warn=original;}
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
