import test from 'node:test';
import assert from 'node:assert/strict';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {createConfiguredInstagramManagementRuntime} from '../src/instagramManagement/defaultRuntime';

test('configuredInstagramAccessVerifiesTheIndependentOAuthGrantAndCurrentCommentCapability',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot(),scopes=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
 const c=await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{expiresAt:new Date(Date.now()+86400000),authorizedAt:new Date(Date.now()-1000),authorizationStartedAt:new Date(Date.now()-2000)}});
 const env={INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-configured-secret',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',API_PUBLIC_URL:'https://example.test',INSTAGRAM_MANAGEMENT_SCOPES:scopes.join(','),META_INBOX_DELETION_ENABLED:'true',META_INBOX_LIVE_ASSETS_JSON:JSON.stringify([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}}])};
 const paths:string[]=[];
 const fetchImpl:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://graph.instagram.com');assert.equal(init?.method??'GET','GET');assert.equal(init?.redirect,'error');assert.ok(init?.signal);assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer sealed:independent');paths.push(url.pathname);
  if(url.pathname==='/v25.0/me')return Response.json({id:c.providerUserId,user_id:'100',account_type:'BUSINESS'});
  if(url.pathname==='/v25.0/100/media')return Response.json({data:[{id:'700'}]});
  if(url.pathname==='/v25.0/700/comments')return Response.json({data:[]});
  throw new Error('Unexpected endpoint');
 };
 const runtime=createConfiguredInstagramManagementRuntime({db:f.db,env,encrypt:v=>v,decrypt:v=>v,fetchImpl});
 const asset=await runtime.access.resolve(f.adminCtx,f.instagramAccountIds[0],'comments.read');
 assert.equal(asset.providerAssetId,'100');assert.equal(asset.connectionVersion,c.version);
 assert.deepEqual(paths,['/v25.0/me','/v25.0/100/media','/v25.0/700/comments']);
 assert.doesNotMatch(JSON.stringify(asset),/sealed:independent|tokenEncrypted|accessToken/);
 assert.deepEqual(await f.publishingSnapshot(),before);
}));

test('configuredGenericAccessKeepsMessagingAvailableWhenCommentsCannotBeVerified',async()=>withMetaInboxFixture(async f=>{
 const before=await f.publishingSnapshot();
 const c=await f.db.instagramManagementConnection.update({where:{id:f.instagramConnectionIds[0]},data:{expiresAt:new Date(Date.now()+86400000),authorizedAt:new Date(Date.now()-1000),authorizationStartedAt:new Date(Date.now()-2000)}});
 const env={INSTAGRAM_MANAGEMENT_ENABLED:'true',INSTAGRAM_CLIENT_ID:'456',INSTAGRAM_CLIENT_SECRET:'synthetic-configured-secret',INSTAGRAM_MANAGEMENT_GRAPH_API_VERSION:'v25.0',INSTAGRAM_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',API_PUBLIC_URL:'https://example.test',META_INBOX_DELETION_ENABLED:'true',META_INBOX_LIVE_ASSETS_JSON:JSON.stringify([{workspaceId:f.adminCtx.workspaceId,platform:'instagram',appId:'456',providerAssetId:'100',readEnabled:true,sendEnabled:false,policy:{product:'synthetic-test-only',graphVersion:'v25.0',checkedAt:'2020-01-01T00:00:00Z',sources:['https://developers.facebook.com/docs/'],rawRetentionDays:7,contentRetentionDays:90,replyWindowMs:86400000,reviewed:true}}])};
 const fetchImpl:typeof fetch=async input=>{
  const url=new URL(String(input));
  if(url.pathname==='/v25.0/me')return Response.json({id:c.providerUserId,user_id:'100',account_type:'BUSINESS'});
  if(url.pathname==='/v25.0/100/media')return Response.json({data:[]});
  if(url.pathname==='/v25.0/100/conversations')return Response.json({data:[]});
  throw new Error('Unexpected endpoint');
 };
 const runtime=createConfiguredInstagramManagementRuntime({db:f.db,env:{...env,INSTAGRAM_MANAGEMENT_SCOPES:'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages'},encrypt:v=>v,decrypt:v=>v,fetchImpl});
 assert.equal((await runtime.access.resolve(f.adminCtx,f.instagramAccountIds[0],'messages.read')).providerAssetId,'100');
 assert.equal((await runtime.access.resolve(f.adminCtx,f.instagramAccountIds[0])).providerAssetId,'100');
 await assert.rejects(runtime.access.resolve(f.adminCtx,f.instagramAccountIds[0],'comments.read'),/verification unavailable/);
 assert.deepEqual(await f.publishingSnapshot(),before);
}));
