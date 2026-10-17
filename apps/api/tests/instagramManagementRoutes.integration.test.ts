import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {withMetaInboxFixture} from './helpers/metaInboxFixture';
import {createInstagramManagementRouter} from '../src/instagramManagement/routes';
import {createInstagramManagementRuntime} from '../src/instagramManagement/runtime';
import {getInstagramManagementConfig} from '../src/instagramManagement/config';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import {safeRequestLogUrl} from '../src/utils/requestLog';
test('managementApiEnforcesAdminAndDisabledStatusWithoutPublishingMutation',async()=>withMetaInboxFixture(async f=>{
 const runtime=createInstagramManagementRuntime({db:f.db,config:getInstagramManagementConfig({}),policy:createLiveInboxPolicy([]),encrypt:v=>v,decrypt:v=>v});
 let ctx=f.viewerCtx;const app=express();app.use(express.json());app.use('/api/v1',createInstagramManagementRouter(runtime,{webAppUrl:'https://app.example.test',authenticate:(req,_res,next)=>{req.user={id:ctx.userId,sessionId:ctx.sessionId} as any;next();}}));app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.statusCode??400).json({message:'denied'}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as any).port,base=`http://127.0.0.1:${port}/api/v1/workspaces/${f.adminCtx.workspaceId}/instagram-management`,before=await f.publishingSnapshot();
 try{
  assert.equal((await fetch(base+`/status?accountId=${f.instagramAccountIds[0]}`)).status,403);
  assert.equal((await fetch(base+'/oauth/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:f.instagramAccountIds[0]})})).status,403);
  assert.equal((await fetch(base+'/connections/'+f.instagramConnectionIds[0],{method:'DELETE'})).status,403);
  ctx=f.adminCtx;const status=await fetch(base+`/status?accountId=${f.instagramAccountIds[0]}`);assert.equal(status.status,200);assert.match(status.headers.get('cache-control')??'',/no-store/);assert.equal((await status.json()).enabled,false);
  const callback=await fetch(`http://127.0.0.1:${port}/api/v1/integrations/instagram-management/oauth/callback?code=private-code&state=private-state`,{redirect:'manual'});assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),'https://app.example.test/inbox?instagram_management=failed');
  assert.deepEqual(await f.publishingSnapshot(),before);
  assert.doesNotMatch(safeRequestLogUrl(`/api/v1/workspaces/${f.adminCtx.workspaceId}/instagram-management/status?accountId=private-account`),/private-account|11111111/);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}));
