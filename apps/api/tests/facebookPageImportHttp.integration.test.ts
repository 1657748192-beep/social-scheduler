import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
test('public holder cannot view or confirm invitations; malformed new state never falls into old callback',async()=>{
 const mod=await import('../src/facebookPageImportInvitations/routes').catch(()=>null);assert.ok(mod,'invitation router must exist');
 const app=express();app.use(express.json({limit:'2kb'}));let starts=0,fallback=0;
 const runtime:any={maintain:async()=>{},flows:{rateLimit:async()=>{}},service:{},oauth:{beginPublicFlow:async()=>{starts++;return{authorizationUrl:'https://www.facebook.com/v20.0/dialog/oauth',cookie:{value:'a'.repeat(43)}};},completePublicFlow:async()=> 'unavailable'}};
 app.use('/api/v1',mod.createInvitationRouter(()=>runtime,{webAppUrl:'https://app.example.test',authenticate:(_req:any,_res:any,next:any)=>next(Object.assign(Error(),{statusCode:401}))}));
 app.get('/api/v1/integrations/facebook/oauth/callback',(_req,res)=>{fallback++;res.send('ordinary');});app.use((e:any,_q:any,res:any,_n:any)=>res.status(e.statusCode||500).json({message:'denied'}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address() as any).port;
 try{
 for(const path of ['/workspaces/00000000-0000-4000-8000-000000000001/facebook-page-import-invitations','/workspaces/00000000-0000-4000-8000-000000000001/facebook-page-import-invitations/00000000-0000-4000-8000-000000000002'])assert.equal((await fetch(url+'/api/v1'+path)).status,401);
 assert.equal((await fetch(url+'/api/v1/facebook-page-import-public/exchange')).status,404);assert.equal(starts,0);
 for(const origin of [undefined,'https://evil.test'])assert.equal((await fetch(url+'/api/v1/facebook-page-import-public/exchange',{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify({secret:'a'.repeat(43)})})).status,403);
 const started=await fetch(url+'/api/v1/facebook-page-import-public/exchange',{method:'POST',headers:{'content-type':'application/json',origin:'https://app.example.test'},body:JSON.stringify({secret:'a'.repeat(43)})});assert.equal(started.status,200);assert.match(started.headers.get('set-cookie')!,/HttpOnly/);assert.match(started.headers.get('set-cookie')!,/Secure/);assert.equal(starts,1);
 const bad=await fetch(url+'/api/v1/integrations/facebook/oauth/callback?state=fbpi_malformed&code=private-code',{redirect:'manual'});assert.equal(bad.status,302);assert.equal(fallback,0);assert.doesNotMatch(bad.headers.get('location')!,/private|fbpi/);
 const large=await fetch(url+'/api/v1/facebook-page-import-public/exchange',{method:'POST',headers:{'content-type':'application/json',origin:'https://app.example.test'},body:JSON.stringify({secret:'a'.repeat(3000)})});assert.equal(large.status,413);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
