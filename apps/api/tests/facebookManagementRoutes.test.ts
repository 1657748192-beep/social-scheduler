import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createFacebookManagementRouter} from '../src/facebookManagement/routes';
import {removedMetaEngagement} from '../src/middleware/removedMetaEngagement';
import {HttpError} from '../src/utils/errors';

test('unauthenticatedForeignViewerAndDisabledRequestsFailClosed',async()=>{
  const workspaceId=randomUUID(),pageId=randomUUID(),connectionId=randomUUID(),scheduleId=randomUUID(),sessionId=randomUUID();
  const ids={owner:randomUUID(),editor:randomUUID(),viewer:randomUUID()};let enabled=true,calls=0,notificationWrites=0;
  const runtime:any={get enabled(){return enabled;},get configured(){return enabled;},member:async(ctx:any)=>{if(ctx.workspaceId!==workspaceId)throw new HttpError(403,'Unavailable');return{role:Object.entries(ids).find(([,id])=>id===ctx.userId)?.[0]};},
    connections:async()=>[],disconnect:async()=>({disconnected:true}),notifications:{status:async()=>({enabled:false,subscription:'missing'}),enableNotifications:async()=>{notificationWrites++;return{enabled:true};}},oauth:{start:async()=>({authorizationUrl:'https://www.facebook.com/authorize'}),callback:async()=>{calls++;return{connectionId};}},
    directory:{list:async()=>({items:[]}),refresh:async()=>({items:[]}),select:async()=>({managedPageId:pageId})},
    engagement:{postAvailability:async(ctx:any,id:string)=>{assert.equal(ctx.managedPageId,pageId);assert.equal(id,scheduleId);return{status:'content_unavailable',checkedAt:'2026-10-17T05:00:00Z'};},capabilities:async()=>({}),conversations:async()=>({items:[]}),messages:async()=>({items:[]}),comments:async()=>({items:[]}),replyMessage:async()=>{calls++;return{status:'sent',providerId:'m1'};},replyComment:async()=>{calls++;return{status:'sent',providerId:'c1'};}}};
  const app=express();app.use(removedMetaEngagement);app.use(express.json());
  app.get('/api/v1/legacy/error',(_req,_res,next)=>next(new HttpError(409,'Legacy error')));
  app.use('/api/v1',createFacebookManagementRouter(runtime,{webAppUrl:'https://example.test',authenticate:(req,res,next)=>{
    const role=req.headers.authorization as keyof typeof ids;if(!ids[role])return next(new HttpError(401,'Missing authentication'));
    req.user={id:ids[role],email:'fixture@example.test',sessionId};next();
  }}));
  app.use(((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({legacy:true})) as express.ErrorRequestHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`,base=`/api/v1/workspaces/${workspaceId}/facebook-management`;
  async function request(path:string,role='owner',method='GET',body?:unknown){return fetch(origin+path,{method,headers:{authorization:role,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});}
  try{
    assert.deepEqual(await (await request('/api/v1/legacy/error')).json(),{legacy:true});
    assert.equal((await request(`${base}/status`,'')).status,401);
    assert.equal((await request(`/api/v1/workspaces/${randomUUID()}/facebook-management/status`)).status,403);
    assert.deepEqual(await (await request(`${base}/status`)).json(),{enabled:true,configured:true});
    assert.equal((await request(`${base}/oauth/start`,'viewer','POST',{})).status,403);
    assert.equal((await request(`${base}/connections/${connectionId}/refresh`,'editor','POST',{})).status,403);
    assert.equal((await request(`${base}/pages/${pageId}/select`,'viewer','POST',{})).status,403);
    assert.equal((await request(`${base}/pages/${pageId}/conversations`,'viewer')).status,200);
    assert.equal((await request(`${base}/pages/${pageId}/notifications/status`,'viewer')).status,200);assert.equal(notificationWrites,0);
    assert.equal((await request(`${base}/pages/${pageId}/notifications/enable`,'editor','POST',{})).status,403);
    assert.equal((await request(`${base}/pages/${pageId}/notifications/enable`,'owner','POST',{})).status,200);assert.equal(notificationWrites,1);
    const reply=`${base}/pages/${pageId}/conversations/c1/replies`;
    assert.equal((await request(reply,'viewer','POST',{text:'Reply',requestKey:randomUUID()})).status,403);
    assert.equal((await request(reply,'editor','POST',{text:'Reply',requestKey:randomUUID()})).status,200);
    assert.equal((await request(reply,'owner','POST',{text:'Reply',requestKey:'bad'})).status,400);
    assert.equal((await request(reply,'owner','POST',{text:'a'.repeat(2001),requestKey:randomUUID()})).status,400);
    assert.equal((await request(`${base}/pages?cursor=${'a'.repeat(2049)}`)).status,400);
    assert.equal((await request(`${base}/pages/${pageId}/posts/${scheduleId}/comments`)).status,200);
    const check=`${base}/pages/${pageId}/posts/${scheduleId}/availability`;
    assert.equal((await request(check,'')).status,401);
    const checked=await request(check,'viewer');assert.equal(checked.headers.get('cache-control'),'no-store');
    assert.deepEqual(await checked.json(),{status:'content_unavailable',checkedAt:'2026-10-17T05:00:00Z'});
    assert.equal((await request(check,'owner','POST',{})).status,404);
    enabled=false;assert.deepEqual(await (await request(`${base}/status`)).json(),{enabled:false,configured:false});
    assert.equal((await request(`${base}/pages`)).status,404);enabled=true;
    for(const path of ['/api/v1/webhooks/instagram','/api/v1/integrations/facebook-engagement/oauth/callback',`/api/v1/workspaces/${workspaceId}/instagram/posts/${scheduleId}/comments`])assert.equal((await request(path)).status,410);
    const callback=await request('/api/v1/integrations/facebook-management/oauth/callback?state=secret-state&code=secret-code','');
    assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),'https://example.test/facebook-management?facebook_management=connected');
    assert.equal(callback.headers.get('referrer-policy'),'no-referrer');assert.equal(calls,2);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
