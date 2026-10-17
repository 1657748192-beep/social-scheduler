import assert from 'node:assert/strict';
import test from 'node:test';
const load=async()=>import('../src/facebookPageSync/graph').catch(()=>null);
const scopes=['pages_show_list','pages_manage_posts','pages_read_engagement'];
const provider:any={platform:'facebook',clientId:'app',clientSecret:'secret',authorizationUrl:'https://www.facebook.com/v20.0/dialog/oauth',tokenUrl:'https://graph.facebook.com/v20.0/oauth/access_token',defaultScopes:scopes,authorizationParams:{auth_type:'rerequest'}};
function fixture(options:any={}){
 const requests:URL[]=[];
 const fetchImpl:any=async(raw:any,init:any)=>{
  const url=new URL(String(raw));requests.push(url);assert.equal(url.hostname,'graph.facebook.com');
  if(options.fail?.(url))return Response.json({error:{message:'page-secret'}},{status:429});
  if(url.pathname.endsWith('/oauth/access_token'))return Response.json({access_token:'user-secret'});
  if(url.pathname.endsWith('/debug_token')){const input=url.searchParams.get('input_token')!;return Response.json({data:{is_valid:!options.revoked,app_id:options.wrongApp?'foreign':'app',type:input==='user-secret'?'USER':'PAGE',user_id:'900',expires_at:0,scopes:options.missing?[]:scopes}});}
  if(url.pathname.endsWith('/me/accounts')){const i=Number(url.searchParams.get('after')||0),count=options.count??25,stop=Math.min(i+10,count);return Response.json({data:Array.from({length:stop-i},(_,n)=>({id:String(i+n+100),name:options.longName?'x'.repeat(201):'Page '+(i+n),access_token:'page-secret-'+(i+n+100),picture:{data:{url:'https://example.test/avatar'}}})),...(stop<count?{paging:{cursors:{after:options.loop?'0':String(stop)},next:'https://evil.test/steal'}}:{})});}
  if(url.pathname.endsWith('/me'))return Response.json({id:'900'});
  const id=url.pathname.split('/').at(-1)!;return Response.json({id:options.wrongIdentity?'wrong':id});
 };
 return{requests,fetchImpl};
}
test('sync discovers all 25 Pages through fixed-host cursors and validates identity without exposing tokens',async()=>{
 const mod=await load();assert.ok(mod,'sync graph module must exist');const f=fixture(),graph=mod.createFacebookPageSyncGraph({provider,appSecret:'secret',callbackUrl:'https://example.test/callback',fetchImpl:f.fetchImpl});
 const result=await graph.discover('code');assert.equal(result.pages.length,25);assert.equal(result.providerUserId,'900');assert.equal(f.requests.filter(u=>u.pathname.endsWith('/me/accounts')).length,3);
 assert.equal(new URL(graph.authorizationUrl('state')).searchParams.get('redirect_uri'),'https://example.test/callback');
 assert.deepEqual(result.pages[0].scopes,scopes);assert.equal(result.pages[0].expiresAt,null);
});
test('partial paging, loops, bad metadata and unsafe grants fail without leaking provider secrets',async()=>{
 const mod=await load();assert.ok(mod);
 for(const options of [{loop:true},{longName:true},{fail:(u:URL)=>u.pathname.endsWith('/me/accounts')&&u.searchParams.has('after')},{wrongApp:true}]){
  const f=fixture(options),graph=mod.createFacebookPageSyncGraph({provider,appSecret:'secret',callbackUrl:'https://example.test/callback',fetchImpl:f.fetchImpl});
  await assert.rejects(graph.discover('code'),(e:any)=>!String(e).includes('page-secret'));
 }
 for(const options of [{missing:true},{revoked:true}]){
  const f=fixture(options),graph=mod.createFacebookPageSyncGraph({provider,appSecret:'secret',callbackUrl:'https://example.test/callback',fetchImpl:f.fetchImpl});
  await assert.rejects(graph.discover('code'));
 }
 const f=fixture({wrongIdentity:true});const denied=await mod.createFacebookPageSyncGraph({provider,appSecret:'secret',callbackUrl:'https://example.test/callback',fetchImpl:f.fetchImpl}).discover('code');assert.equal(denied.pages.length,0);assert.equal(denied.rejected.length,25);
});
test('sync directory rejects beyond 2000 and rechecks selected page credentials',async()=>{
 const mod=await load();assert.ok(mod);const f=fixture({count:2000}),graph=mod.createFacebookPageSyncGraph({provider,appSecret:'secret',callbackUrl:'https://example.test/callback',fetchImpl:f.fetchImpl});
 const result=await graph.discover('code');assert.equal(result.pages.length,2000);
 const overflow=fixture({count:2001});await assert.rejects(mod.createFacebookPageSyncGraph({provider,appSecret:'secret',callbackUrl:'https://example.test/callback',fetchImpl:overflow.fetchImpl}).discover('code'));
 const revoked=fixture({revoked:true});await assert.rejects(mod.createFacebookPageSyncGraph({provider,appSecret:'secret',callbackUrl:'https://example.test/callback',fetchImpl:revoked.fetchImpl}).revalidate([result.pages[0]]));
});
