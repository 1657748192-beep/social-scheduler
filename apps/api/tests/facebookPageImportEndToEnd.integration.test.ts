import assert from 'node:assert/strict';import test from 'node:test';import jwt from 'jsonwebtoken';import {fork} from 'node:child_process';import {randomUUID} from 'node:crypto';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {withPageImportFixture} from './helpers/facebookPageImportInvitationsFixture';
test('real authenticated creator, external authorization, new session and selected-only import preserve all original records',()=>withPageImportFixture(async f=>{
 const env=require('../../../scripts/run-tests.cjs').environment(true,true),key='page-import-http-local-test-only';
 const child=fork(path.resolve('apps/api/tests/fixtures/facebookPageImportHttp.ts'),[],{execArgv:['--import',pathToFileURL(require.resolve('tsx')).href],stdio:['ignore','ignore','ignore','ipc'],env:{...env,DATABASE_URL:env.FACEBOOK_TEST_DATABASE_URL,REDIS_URL:env.LOCAL_UPLOAD_TEST_REDIS_URL,JWT_SECRET:key,WEB_APP_URL:'https://app.example.test',FACEBOOK_MANAGEMENT_ENABLED:'false',ADMIN_EMAILS:`${f.userId}@example.test`}});
 const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture startup timed out')),15000);child.once('message',(msg:any)=>{clearTimeout(timer);resolve(msg.port);});child.once('exit',()=>{clearTimeout(timer);reject(Error('Fixture exited'));});});
 const origin='http://127.0.0.1:'+port,base=origin+'/api/v1/workspaces/'+f.ctx.workspaceId+'/facebook-page-import-invitations',json={'content-type':'application/json'};
 const token=async(sid:string)=>{const session=await f.db.userSession.findUniqueOrThrow({where:{id:sid}});return jwt.sign({sub:f.userId,email:'local@example.test',sid,jti:session.tokenId},key,{expiresIn:'1h'});};
 try{
 const headers={...json,authorization:'Bearer '+await token(f.ctx.sessionId)},before=await f.snapshot();
 const customerId=randomUUID();
 try{
  await f.db.user.create({data:{id:customerId,email:customerId+'@example.test',name:'Ordinary owner',passwordHash:'synthetic'}});
  await f.db.workspaceMember.create({data:{workspaceId:f.ctx.workspaceId,userId:customerId,role:'owner',status:'active'}});
  const s=await f.db.userSession.create({data:{userId:customerId,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
  // A stale/incorrect JWT email must not grant platform access: current DB identity is authoritative.
  const customer=jwt.sign({sub:customerId,email:`${f.userId}@example.test`,sid:s.id,jti:s.tokenId},key,{expiresIn:'1h'});
  const id=randomUUID();for(const [suffix,method,body] of [['','GET',undefined],['','POST',{}],['/'+id,'GET',undefined],['/'+id+'/confirm','POST',{pageIds:['101']}],['/'+id+'/complete-empty','POST',{}],['/'+id+'/revoke','POST',{}]] as const){
   const response=await fetch(base+suffix,{method,headers:{...json,authorization:'Bearer '+customer},...(body?{body:JSON.stringify(body)}:{})});assert.equal(response.status,403);
  }
 }finally{await f.db.user.deleteMany({where:{id:customerId}});}
 const create=await fetch(base,{method:'POST',headers,body:JSON.stringify({note:'Account B'})});assert.equal(create.status,200);const invite:any=await create.json();const secret=new URL(invite.shareUrl).hash.slice(1);
 const exchange=await fetch(origin+'/api/v1/facebook-page-import-public/exchange',{method:'POST',headers:{...json,origin:'https://app.example.test'},body:JSON.stringify({secret})});assert.equal(exchange.status,200);const start:any=await exchange.json(),cookie=exchange.headers.get('set-cookie')!.split(';')[0],state=new URL(start.authorizationUrl).searchParams.get('state');
 const callback=await fetch(origin+'/api/v1/integrations/facebook/oauth/callback?state='+state+'&code=controlled-code',{headers:{cookie},redirect:'manual'});assert.equal(callback.status,302);assert.match(callback.headers.get('location')!,/result=received/);assert.deepEqual(await f.snapshot(),before);
 assert.equal((await fetch(base+'/'+invite.view.id+'/confirm',{method:'POST',headers:json,body:JSON.stringify({pageIds:['101']})})).status,401);
 const next=await f.db.userSession.create({data:{userId:f.userId,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});await f.db.userSession.update({where:{id:f.ctx.sessionId},data:{revokedAt:new Date()}});
 const current={...json,authorization:'Bearer '+await token(next.id)};
 assert.equal((await fetch(base+'/'+invite.view.id,{headers})).status,401);
 const details=await fetch(base+'/'+invite.view.id,{headers:current});assert.equal(details.status,200);assert.doesNotMatch(await details.text(),/synthetic-|pageToken|secretHash/);
 const response=await fetch(base+'/'+invite.view.id+'/confirm',{method:'POST',headers:current,body:JSON.stringify({pageIds:['100','101']})});assert.equal(response.status,200);assert.deepEqual(await response.json(),{createdPageIds:['101'],skippedPageIds:['100']});assert.deepEqual(await f.snapshot(),before);
 assert.equal(await f.db.socialAccount.count({where:{workspaceId:f.ctx.workspaceId,providerAccountId:'102'}}),0);
 }finally{if(child.connected)child.send('stop');await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
}));
