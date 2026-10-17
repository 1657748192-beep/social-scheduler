import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {randomBytes,randomUUID} from 'node:crypto';
import {withFacebookManagementFixture} from './helpers/facebookManagementFixture';
import {startFacebookManagementHttp} from './helpers/facebookManagementHttp';
test('real login and active workspace manager membership protect sync API without platform admin or publishing changes',async()=>withFacebookManagementFixture(async(f:any)=>{
 const http=await startFacebookManagementHttp(),ctx=f.contexts[0],session=await f.db.userSession.findUniqueOrThrow({where:{id:f.sessionId}});
 const token=jwt.sign({sub:f.userId,email:`${f.userId}@example.test`,sid:f.sessionId,jti:session.tokenId},'facebook-management-http-test-only',{expiresIn:'1h'}),headers={authorization:`Bearer ${token}`};
 const id=randomBytes(32).toString('base64url'),base=http.origin+`/api/v1/workspaces/${ctx.workspaceId}/facebook-page-sync`,before=await f.snapshot();
 try{
  assert.equal((await fetch(base+'/'+id)).status,401);
  assert.equal((await fetch(base+'/'+id,{headers})).status,410);
  assert.equal((await fetch(http.origin+`/api/v1/workspaces/${randomUUID()}/facebook-page-sync/`+id,{headers})).status,403);
  for(const role of ['viewer','editor']){await f.db.workspaceMember.updateMany({where:{workspaceId:ctx.workspaceId,userId:ctx.userId},data:{role:role as any}});for(const [path,method] of [['/start','POST'],['/'+id,'GET'],['/'+id,'DELETE'],['/'+id+'/confirm','POST']]){const response=await fetch(base+path,{method,headers:{...headers,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(path==='/start'?{}:{pageIds:['100']})}:{})});assert.equal(response.status,403);}}
  await f.db.workspaceMember.updateMany({where:{workspaceId:ctx.workspaceId,userId:ctx.userId},data:{role:'admin'}});assert.equal((await fetch(base+'/'+id,{headers})).status,410);
  const bad=await fetch(http.origin+'/api/v1/integrations/facebook/oauth/callback?state=fbps_unknown&code=sensitive-code',{redirect:'manual'});assert.equal(bad.status,302);assert.doesNotMatch(bad.headers.get('location')!,/sensitive|unknown/);
  assert.deepEqual(await f.snapshot(),before);
 }finally{await http.stop();}
}));
