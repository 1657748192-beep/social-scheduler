import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {randomBytes,randomUUID} from 'node:crypto';
test('dedicated sync callbacks never fall through to normal binding and responses do not echo provider secrets',async()=>{
 const mod=await import('../src/facebookPageSync/routes').catch(()=>null);assert.ok(mod);let legacy=0,callbacks=0;
 const id=randomBytes(32).toString('base64url'),workspaceId=randomUUID();
 const service:any={callback:async(input:any)=>{callbacks++;if(input.error||input.state==='fbps_bad')throw Error('provider-secret');return{syncId:id,workspaceId};},start:async()=>({authorizationUrl:'https://www.facebook.com/authorize'}),view:async()=>({syncId:id,workspaceId,pages:[]}),confirm:async(_ctx:any,_id:string,pageIds:any)=>({createdPageIds:pageIds,skippedPageIds:[]}),cancel:async()=>{}};
 const app=express();app.use(express.json());app.use(mod.createFacebookPageSyncRouter(()=>service,{webAppUrl:'https://example.test',authenticate:(req,_res,next)=>{req.user={id:randomUUID(),email:'owner@example.test',sessionId:randomUUID()};next();}}));app.use((_req,res)=>{legacy++;res.status(418).end();});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 try{
  for(const path of ['/integrations/facebook/oauth/callback?state=fbps_bad&code=provider-secret','/integrations/tiktok/oauth/callback?state=fbps_bad&code=provider-secret','/integrations/facebook/oauth/callback?state=fbps_'+id+'&error=provider-secret']){const res=await fetch(origin+path,{redirect:'manual'});assert.equal(res.status,302);assert.equal(res.headers.get('referrer-policy'),'no-referrer');assert.equal(res.headers.get('cache-control'),'no-store');assert.doesNotMatch(res.headers.get('location')!,/provider-secret|fbps_/);}
  assert.equal(legacy,0);assert.equal(callbacks,2);
  const good=await fetch(origin+'/integrations/facebook/oauth/callback?state=fbps_'+id+'&code=code',{redirect:'manual'});assert.equal(new URL(good.headers.get('location')!).searchParams.get('facebookPageSync'),id);
  const base=origin+`/workspaces/${workspaceId}/facebook-page-sync`;
  const malformed=await fetch(base+'/'+id+'/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pageIds:['100'],accessToken:'secret'})});assert.equal(malformed.status,400);assert.doesNotMatch(await malformed.text(),/secret/);
  assert.equal((await fetch(origin+'/integrations/facebook/oauth/callback?state=normal')).status,418);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
