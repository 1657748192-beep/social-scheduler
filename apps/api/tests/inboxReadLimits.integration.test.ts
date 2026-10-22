import test from 'node:test';import assert from 'node:assert/strict';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {withInboxFixture} from './helpers/interactionInboxFixture';
import {FacebookDirectoryError} from '../src/facebookManagement/graphDirectory';
import {createFacebookPageAccess} from '../src/facebookManagement/access';
import {HttpError} from '../src/utils/errors';

test('real Page access still rejects session revocation while the read operation holds remote evidence',async()=>withFacebookManagementFixture(async f=>{
 const m=await import('../src/facebookManagement/readInspection'),guard=m.createFacebookReadInspectionGuard();let inspections=0;
 const access=createFacebookPageAccess({db:f.db,decrypt:v=>v,inspect:async(_id,_token,c,options)=>guard(JSON.stringify([c?.id,c?.version]),async()=>{inspections++;return{pageId:'100',scopes:f.scopes,granularScopes:[],expiresAt:null};},{fresh:options?.write})});
 await m.withFacebookReadInspection(async()=>{await access.resolvePageAccess(f.contexts[0]);await access.resolvePageAccess(f.contexts[0]);assert.equal(inspections,1);await f.db.userSession.update({where:{id:f.sessionId},data:{revokedAt:new Date()}});await assert.rejects(()=>access.resolvePageAccess(f.contexts[0]),(e:any)=>e.status===403);});
}));

test('real Page write checks bypass coalesced evidence and detect provider permission withdrawal',async()=>withFacebookManagementFixture(async f=>{
 const m=await import('../src/facebookManagement/readInspection'),guard=m.createFacebookReadInspectionGuard();let revoked=false,calls=0;
 const access=createFacebookPageAccess({db:f.db,decrypt:v=>v,inspect:async(_id,_token,c,options)=>guard(JSON.stringify([c?.id,c?.version]),async()=>{calls++;if(revoked)throw new FacebookDirectoryError('authorization_invalid');return{pageId:'100',scopes:f.scopes,granularScopes:[],expiresAt:null};},{fresh:options?.write})});
 await m.withFacebookReadInspection(async()=>{await access.resolvePageAccess(f.contexts[0]);revoked=true;await assert.rejects(()=>access.resolvePageAccess(f.contexts[0],{write:true}));assert.equal(calls,2);});
}));

test('rate-limited token inspection is a retryable limit, not a missing Page',async()=>withFacebookManagementFixture(async f=>{
 const access=createFacebookPageAccess({db:f.db,decrypt:v=>v,inspect:async()=>{throw new FacebookDirectoryError('rate_limited',120);}});
 await assert.rejects(()=>access.resolvePageAccess(f.contexts[0]),(e:any)=>e.statusCode===429&&e.details?.retryAfter===120);
}));

test('a limited inbox account returns no private bodies, an explicit rate status and retry delay',async()=>withInboxFixture(async f=>{
 const {createInboxReads}=await import('../src/interactionInbox/reads');const before=await f.protectedSnapshot();
 const reads=createInboxReads({db:f.db,access:{require:async()=>{},resolveInboxAsset:async()=>{throw new HttpError(429,'limited',{retryAfter:120});}} as any,registry:{getInboxAdapter:()=>{throw Error('no body read allowed');}} as any,redis:{eval:async()=>1} as any});
 const result=await reads.listCases(f.adminCtx,{accountIds:[f.accountIds[0]],kind:'messages'});assert.equal(result.partial,true);assert.deepEqual(result.items,[]);assert.equal(result.accountsStatus[0].status,'rate_limited');assert.equal(result.accountsStatus[0].retryAfter,120);assert.equal(result.accountsStatus[0].count,null);assert.deepEqual(await f.protectedSnapshot(),before);
}));

test('runtime read inspection isolates grant epochs and preserves the post-await selection fence',async()=>withFacebookManagementFixture(async f=>{
 const {withFacebookReadInspection}=await import('../src/facebookManagement/readInspection');const {createFacebookManagementRuntime}=await import('../src/facebookManagement/runtime');let calls=0;
 const runtime=createFacebookManagementRuntime({db:f.db,settings:{enabled:true,appId:'123',graphVersion:'v26.0',loginConfigId:'555',callbackUrl:'https://example.test/api/v1/integrations/facebook-management/oauth/callback'},appSecret:'test-secret',encrypt:v=>v,decrypt:v=>v,fetchImpl:async url=>{calls++;return String(url).includes('/debug_token')?Response.json({data:{app_id:'123',is_valid:true,scopes:f.scopes}}):Response.json({id:'100'});}});
 await withFacebookReadInspection(async()=>{await runtime.engagement.capabilities(f.contexts[0]);await runtime.engagement.capabilities(f.contexts[0]);assert.equal(calls,2);await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{version:{increment:1}}});await runtime.engagement.capabilities(f.contexts[0]);assert.equal(calls,4);
 await f.db.facebookManagedPage.update({where:{id:f.pages[0].id},data:{pageTokenEncrypted:'rotated-page'}});await runtime.engagement.capabilities(f.contexts[0]);assert.equal(calls,6);
 await f.db.facebookManagementConnection.update({where:{id:f.connections[0].id},data:{userTokenEncrypted:'rotated-user'}});await runtime.engagement.capabilities(f.contexts[0]);assert.equal(calls,8);
 await runtime.engagement.capabilities(f.contexts[1]);assert.equal(calls,10);
 await f.db.facebookManagementPageSelection.deleteMany({where:{workspaceId:f.contexts[0].workspaceId}});await assert.rejects(()=>runtime.engagement.capabilities(f.contexts[0]));assert.equal(calls,10);});
}));

test('selection revoked during the provider wait cannot return a usable Page grant',async()=>withFacebookManagementFixture(async f=>{
 let finish!:(v:any)=>void,started!:()=>void;const entered=new Promise<void>(r=>{started=r;});
 const access=createFacebookPageAccess({db:f.db,decrypt:v=>v,inspect:async()=>{started();return new Promise(resolve=>{finish=resolve;});}}),result=access.resolvePageAccess(f.contexts[0]);const rejected=assert.rejects(result);
 await entered;await f.db.facebookManagementPageSelection.deleteMany({where:{workspaceId:f.contexts[0].workspaceId}});finish({pageId:'100',scopes:f.scopes,granularScopes:[],expiresAt:null});await rejected;
}));

test('local session revocation still takes precedence over an app inspection cooldown',async()=>withFacebookManagementFixture(async f=>{
 const m=await import('../src/facebookManagement/readInspection'),guard=m.createFacebookReadInspectionGuard();let calls=0;
 const access=createFacebookPageAccess({db:f.db,decrypt:v=>v,inspect:async()=>guard('a',async()=>{calls++;throw new FacebookDirectoryError('rate_limited',120);})});await assert.rejects(()=>access.resolvePageAccess(f.contexts[0]),(e:any)=>e.statusCode===429);
 await f.db.userSession.update({where:{id:f.sessionId},data:{revokedAt:new Date()}});await assert.rejects(()=>access.resolvePageAccess(f.contexts[0]),(e:any)=>e.status===403);assert.equal(calls,1);
}));

test('message read rate limits remain retryable and do not invalidate credentials or create send attempts',async()=>withFacebookManagementFixture(async f=>{
 const {createFacebookManagementRuntime}=await import('../src/facebookManagement/runtime');const before=await f.snapshot();let calls=0;
 const runtime=createFacebookManagementRuntime({db:f.db,settings:{enabled:true,appId:'123',graphVersion:'v26.0',loginConfigId:'555',callbackUrl:'https://example.test/api/v1/integrations/facebook-management/oauth/callback'},appSecret:'test-secret',encrypt:v=>v,decrypt:v=>v,fetchImpl:async url=>{
  calls++;const path=new URL(String(url)).pathname;if(path.endsWith('/debug_token'))return Response.json({data:{app_id:'123',is_valid:true,scopes:f.scopes}});if(path.endsWith('/me'))return Response.json({id:'100'});if(path.endsWith('/messages'))return Response.json({error:{code:4,message:'private error'}},{status:429,headers:{'Retry-After':'120'}});return Response.json({id:'thread',participants:{data:[{id:'100'},{id:'300'}]},updated_time:new Date().toISOString()});}});
 await assert.rejects(()=>runtime.engagement.messages(f.contexts[0],'thread'),(e:any)=>e.statusCode===429&&e.details?.retryAfter===120);assert.deepEqual(await f.snapshot(),before);assert.equal(await f.db.facebookInteractionSendAttempt.count({where:{managedPageId:f.pages[0].id}}),0);
 const beforeRetry=calls;await assert.rejects(()=>runtime.engagement.capabilities(f.contexts[0]),(e:any)=>e.statusCode===429);assert.equal(calls,beforeRetry);
}));
