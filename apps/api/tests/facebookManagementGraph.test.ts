import assert from 'node:assert/strict';
import test from 'node:test';
import {createFacebookDirectoryClient,readAllDirectoryPages} from '../src/facebookManagement/graphDirectory';

const base={userToken:'private-user-token',apiVersion:'v26.0',appId:'123',appSecret:'private-app-secret'};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('three cursor pages return twenty-one distinct pages through the trusted Graph host',async()=>{
  const requested:string[]=[];
  const client=createFacebookDirectoryClient({...base,fetchImpl:async(url,init)=>{
    const u=new URL(String(url));requested.push(u.href);
    assert.equal(u.origin,'https://graph.facebook.com');assert.equal(u.pathname,'/v26.0/me/accounts');
    assert.equal(u.searchParams.get('access_token'),null);assert.equal(u.searchParams.get('limit'),'25');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-user-token');
    assert.equal(init?.redirect,'error');assert.ok(init?.signal instanceof AbortSignal);
    const index=u.searchParams.get('after')==='second'?1:u.searchParams.get('after')==='third'?2:0;
    return response({data:Array.from({length:7},(_,i)=>({id:String(index*7+i+1),name:'Page',access_token:'independent-page-token',tasks:['MODERATE']})),
      ...(index<2?{paging:{cursors:{after:index===0?'second':'third'},next:'https://graph.facebook.com/v26.0/me/accounts?ignore=provider-url'}}:{})});
  }});
  const pages=await readAllDirectoryPages(after=>client.listUserPages(after));
  assert.equal(pages.length,21);assert.deepEqual(pages.map(p=>p.id),Array.from({length:21},(_,i)=>String(i+1)));
  assert.equal(requested.length,3);
});

test('business relationship tasks are not treated as the current user tasks',async()=>{
  const client=createFacebookDirectoryClient({...base,fetchImpl:async(url)=>{
    const u=new URL(String(url));assert.equal(u.pathname,'/v26.0/901/client_pages');
    return response({data:[{id:'55',name:'Same name',link:'https://www.facebook.com/55',permitted_tasks:['MANAGE'],access_token:'not-user-grant',tasks:['MANAGE']}]});
  }});
  const result=await client.listBusinessPages('901','client');
  assert.deepEqual(result.items,[{id:'55',name:'Same name',profileUrl:'https://www.facebook.com/55',avatarUrl:null}]);
});

test('foreign paging host, repeated cursors and overlong cursors are rejected',async()=>{
  let calls=0;
  const client=createFacebookDirectoryClient({...base,fetchImpl:async()=>{calls++;return response({data:[],paging:{next:'https://attacker.example/steal',cursors:{after:'next'}}});}});
  await assert.rejects(()=>client.listBusinesses(),/invalid_response/);assert.equal(calls,1);
  await assert.rejects(()=>client.listBusinesses('x'.repeat(2049)),/invalid_input/);assert.equal(calls,1);
  await assert.rejects(()=>readAllDirectoryPages(async()=>({items:[],nextCursor:'same'})),/invalid_response/);
});

test('partial rate limits, malformed pages and transport errors never become empty success',async()=>{
  for(const scenario of ['rate','malformed','network']) {
    let calls=0;
    const client=createFacebookDirectoryClient({...base,fetchImpl:async()=>{
      calls++;
      if(calls===1)return response({data:[{id:'1',name:'One'}],paging:{next:'https://graph.facebook.com/v26.0/me/businesses',cursors:{after:'second'}}});
      if(scenario==='rate')return response({error:{code:4,message:'private-user-token private-app-secret'}},429);
      if(scenario==='network')throw new Error('private-user-token');
      return response({unexpected:[]});
    }});
    await assert.rejects(()=>readAllDirectoryPages(after=>client.listBusinesses(after)),error=>{
      assert.ok(error instanceof Error);assert.match(error.message,scenario==='rate'?/rate_limited/:scenario==='network'?/temporary_failure/:/invalid_response/);
      assert.doesNotMatch(error.message,/private-user-token|private-app-secret/);return true;
    });
    assert.equal(calls,2);
  }
});

test('directory requests run at most two at once',async()=>{
  let running=0,maximum=0;
  const client=createFacebookDirectoryClient({...base,fetchImpl:async()=>{
    running++;maximum=Math.max(running,maximum);await new Promise(resolve=>setTimeout(resolve,8));running--;return response({data:[]});
  }});
  await Promise.all(Array.from({length:7},()=>client.listBusinesses()));assert.equal(maximum,2);
});

test('page token validation checks app, real token identity, scopes and finite expiry',async()=>{
  const client=createFacebookDirectoryClient({...base,fetchImpl:async(url,init)=>{
    const u=new URL(String(url));const headers=new Headers(init?.headers);
    if(u.pathname.endsWith('/debug_token')){
      assert.equal(headers.get('Authorization'),'Bearer 123|private-app-secret');assert.equal(u.searchParams.get('input_token'),'independent-token');
      return response({data:{app_id:'123',is_valid:true,scopes:['pages_messaging'],granular_scopes:[{scope:'pages_messaging',target_ids:['55']}],expires_at:1900000000}});
    }
    assert.equal(u.pathname,'/v26.0/me');assert.equal(u.searchParams.get('fields'),'id');
    assert.equal(headers.get('Authorization'),'Bearer independent-token');return response({id:'55'});
  }});
  assert.deepEqual(await client.inspectPageToken('55','independent-token'),{
    pageId:'55',scopes:['pages_messaging'],granularScopes:[{scope:'pages_messaging',targetIds:['55']}],expiresAt:'2030-03-17T17:46:40.000Z',
  });
  await assert.rejects(()=>client.inspectPageToken('56','independent-token'),/authorization_invalid/);
});

test('invalid token app or grants fail without leaking secrets or accepting unsafe identifiers',async()=>{
  for(const data of [
    {app_id:'other',is_valid:true,scopes:[]},{app_id:'123',is_valid:false,scopes:[]},
    {app_id:'123',is_valid:true},{app_id:'123',is_valid:true,scopes:[],expires_at:'tomorrow'},
  ]) {
    const client=createFacebookDirectoryClient({...base,fetchImpl:async()=>response({data})});
    await assert.rejects(()=>client.inspectPageToken('55','independent-token'),/authorization_invalid|invalid_response/);
  }
  const client=createFacebookDirectoryClient({...base,fetchImpl:async()=>{throw new Error('should not fetch');}});
  await assert.rejects(()=>client.listBusinessPages('../55','owned'),/invalid_input/);
});
