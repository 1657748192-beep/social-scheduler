import test from 'node:test';import assert from 'node:assert/strict';import jwt from 'jsonwebtoken';import {randomUUID} from 'node:crypto';import {withInboxFixture} from './helpers/interactionInboxFixture';import {startFacebookManagementHttp} from './helpers/facebookManagementHttp';
test('real HTTP inbox requires current platform admin and workspace membership on every route',async()=>withInboxFixture(async f=>{
 const user=await f.db.user.findUniqueOrThrow({where:{id:f.adminCtx.userId}}),viewer=await f.db.user.findUniqueOrThrow({where:{id:f.viewerCtx.userId}}),http=await startFacebookManagementHttp(user.email+','+viewer.email);
 const token=async(ctx:any)=>{const session=await f.db.userSession.findUniqueOrThrow({where:{id:ctx.sessionId}});return jwt.sign({sub:ctx.userId,email:'forged-admin@example.test',sid:session.id,jti:session.tokenId},'facebook-management-http-test-only');};
 try{const adminToken=await token(f.adminCtx),viewerToken=await token(f.viewerCtx),id=randomUUID(),base=`${http.origin}/api/v1/workspaces/${f.adminCtx.workspaceId}/interaction-inbox`,paths:[string,string][]=[['GET','/accounts'],['GET','/capabilities'],['GET','/cases'],['GET',`/cases/${id}`],['GET',`/customers/${id}`],['GET',`/customers/${id}/notes`],['GET','/tags'],['POST','/refresh'],['POST',`/cases/${id}/replies`],['PATCH',`/cases/${id}`],['POST',`/cases/${id}/read`],['POST','/cases/batch'],['POST','/tags'],['DELETE',`/customers/${id}`]];
 const request=(method:string,path:string,t?:string,body?:unknown)=>fetch(base+path,{method,headers:{...(t?{authorization:'Bearer '+t}:{}),'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body??{})})});
 for(const [method,path] of paths){const response=await request(method,path);assert.equal(response.status,401,method+' '+path);assert.match(response.headers.get('cache-control')??'',/no-store/);}
 assert.equal((await request('GET','/accounts',adminToken)).status,200);assert.equal((await request('GET','/tags',adminToken)).status,200);
 await f.db.user.update({where:{id:user.id},data:{email:randomUUID()+'@not-admin.test'}});
 for(const [method,path] of paths)assert.equal((await request(method,path,adminToken)).status,403,method+' '+path);
 await f.db.user.update({where:{id:user.id},data:{email:user.email}});
 for(const [method,path] of paths.filter(([method])=>method!=='GET'))assert.equal((await request(method,path,viewerToken)).status,403,method+' '+path);
 assert.equal((await fetch(base.replace(f.adminCtx.workspaceId,randomUUID())+'/accounts',{headers:{authorization:'Bearer '+adminToken}})).status,403);
 assert.equal((await request('GET',`/cases/${id}?kind=messages&accountIds=${f.accountIds[0]}`,adminToken)).status,404);
 assert.equal((await request('POST','/refresh',adminToken,{accountIds:[],kind:'messages',enabled:true})).status,400);
 }finally{await f.db.user.update({where:{id:user.id},data:{email:user.email}});await http.stop();}
}));
