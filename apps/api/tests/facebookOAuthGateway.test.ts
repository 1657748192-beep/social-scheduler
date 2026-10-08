import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeFacebookEngagementGrant } from '../src/integrations/oauth/facebookEngagementGateway';
import * as gateway from '../src/integrations/oauth/facebookEngagementGateway';
import { HttpError } from '../src/utils/errors';
const json=(value:unknown)=>new Response(JSON.stringify(value));
const settings={appId:'app',appSecret:'secret',apiVersion:'v20.0'};
for(const fixture of [
  {page:undefined,reason:'selected_page_missing'},
  {page:{id:'100',tasks:['MODERATE']},reason:'page_token_missing'},
  {page:{id:'100',access_token:'private-page-token'},reason:'page_tasks_missing'}
])test(`Facebook incomplete Page grant distinguishes ${fixture.reason} and actual permission status`,async()=>{
  await assert.rejects(exchangeFacebookEngagementGrant({...settings,code:'private-code',redirectUri:'https://example.test/callback',pageId:'100',fetchImpl:(async(url)=>{
    const path=new URL(String(url)).pathname;
    if(path.endsWith('/oauth/access_token'))return json({access_token:'private-user-token'});
    if(path.endsWith('/me/accounts'))return json({data:fixture.page?[fixture.page]:[]});
    if(path.endsWith('/100'))return json({});
    assert.ok(path.endsWith('/me/permissions'));
    return json({data:[{permission:'pages_show_list',status:'granted'},{permission:'pages_messaging',status:'declined'},{permission:'private-permission',status:'private-status'}]});
  }) as typeof fetch}),error=>{
    const safe=gateway.summarizeFacebookAuthorizationFailure(error);
    assert.deepEqual(safe,{reason:fixture.reason,status:400,stage:'me/accounts',pages_show_list:'granted',pages_messaging:'declined'});
    assert.ok(!JSON.stringify(error).includes('private-'));
    return true;
  });
});
test('Facebook resolves an already-selected Page directly when listing omits it, retaining task and token verification',async()=>{
  const calls:string[]=[];
  const grant=await exchangeFacebookEngagementGrant({...settings,code:'code',redirectUri:'https://example.test/callback',pageId:'100',fetchImpl:(async(url,init)=>{
    const parsed=new URL(String(url));
    calls.push(parsed.pathname);
    if(parsed.pathname.endsWith('/oauth/access_token'))return json({access_token:'user-token'});
    if(parsed.pathname.endsWith('/me/accounts'))return json({data:[]});
    if(parsed.pathname.endsWith('/100')){
      assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer user-token');
      assert.equal(parsed.searchParams.get('fields'),'id,access_token,permitted_tasks');
      return json({id:'100',access_token:'page-token',permitted_tasks:['MODERATE','MESSAGING']});
    }
    if(parsed.pathname.endsWith('/debug_token'))return json({data:{is_valid:true,type:'PAGE',app_id:'app',profile_id:'100',scopes:['pages_manage_posts'],expires_at:0}});
    assert.equal(parsed.pathname,'/v20.0/me');
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer page-token');
    return json({id:'100'});
  }) as typeof fetch});
  assert.deepEqual(grant,{pageId:'100',pageToken:'page-token',scopes:['pages_manage_posts'],expiresAt:null});
  assert.deepEqual(calls,['/v20.0/oauth/access_token','/v20.0/me/accounts','/v20.0/100','/v20.0/debug_token','/v20.0/me']);
});
test('Facebook direct Page lookup cannot accept a token without actual permitted tasks',async()=>{
  await assert.rejects(exchangeFacebookEngagementGrant({...settings,code:'code',redirectUri:'https://example.test/callback',pageId:'100',fetchImpl:(async(url)=>{
    const path=new URL(String(url)).pathname;
    if(path.endsWith('/oauth/access_token'))return json({access_token:'user-token'});
    if(path.endsWith('/me/accounts') || path.endsWith('/me/permissions'))return json({data:[]});
    assert.equal(path,'/v20.0/100');
    return json({id:'100',access_token:'page-token',permitted_tasks:[]});
  }) as typeof fetch}),error=>{
    assert.equal(gateway.summarizeFacebookAuthorizationFailure(error).reason,'page_tasks_missing');return true;
  });
});
test('Facebook direct Page lookup rejects a different Page identity',async()=>{
  await assert.rejects(exchangeFacebookEngagementGrant({...settings,code:'code',redirectUri:'https://example.test/callback',pageId:'100',fetchImpl:(async(url)=>{
    const path=new URL(String(url)).pathname;
    if(path.endsWith('/oauth/access_token'))return json({access_token:'user-token'});
    if(path.endsWith('/me/accounts'))return json({data:[]});
    return json({id:'200',access_token:'wrong-token',permitted_tasks:['MANAGE']});
  }) as typeof fetch}),error=>{
    assert.equal(gateway.summarizeFacebookAuthorizationFailure(error).reason,'page_identity_mismatch');return true;
  });
});
test('callback diagnostic strips arbitrary error fields and categorizes retained-permission failure',()=>{
  const summarize=(gateway as unknown as {summarizeFacebookAuthorizationFailure?:(error:unknown)=>unknown}).summarizeFacebookAuthorizationFailure;
  assert.equal(typeof summarize,'function');
  assert.deepEqual(summarize!(new Error('private-token')),{reason:'unknown'});
  assert.deepEqual(summarize!(new HttpError(400,'The selected Page or original permissions were not retained; existing connection unchanged.')),{reason:'original_permissions_not_retained',status:400});
  assert.deepEqual(summarize!(new HttpError(502,'private-token',{stage:'oauth/access_token',reason:'provider_rejected',providerCode:100,providerSubcode:'private-token',access_token:'private-token'})),{reason:'provider_rejected',status:502,stage:'oauth/access_token',providerCode:100});
});
test('Facebook rejection exposes only safe stage and numeric provider codes',async()=>{
  await assert.rejects(exchangeFacebookEngagementGrant({...settings,code:'private-code',redirectUri:'https://example.test/callback',pageId:'100',fetchImpl:(async()=>new Response(JSON.stringify({error:{code:100,error_subcode:36008,message:'private-token secret',fbtrace_id:'private-trace'}}),{status:400})) as typeof fetch}), error=>{
    assert.deepEqual((error as {details?:unknown}).details,{stage:'oauth/access_token',reason:'provider_rejected',providerCode:100,providerSubcode:36008});
    assert.ok(!JSON.stringify(error).includes('private-'));
    return true;
  });
});
test('Facebook transport failure identifies stage without exception text',async()=>{
  await assert.rejects(exchangeFacebookEngagementGrant({...settings,code:'private-code',redirectUri:'https://example.test/callback',pageId:'100',fetchImpl:(async()=>{throw new Error('private-token');}) as typeof fetch}),error=>{
    assert.deepEqual((error as {details?:unknown}).details,{stage:'oauth/access_token',reason:'transport_failed'});
    assert.ok(!JSON.stringify(error).includes('private-token'));
    return true;
  });
});
test('Facebook exchange returns actual Page grant not requested scopes',async()=>{
  const grant=await exchangeFacebookEngagementGrant({...settings,code:'code',redirectUri:'https://example.test/callback',pageId:'100',fetchImpl:(async(url,init)=>{
    const parsed=new URL(String(url));
    if(parsed.pathname.endsWith('/oauth/access_token')){assert.equal(init?.method,'POST');return json({access_token:'user-token'});}
    if(parsed.pathname.endsWith('/me/accounts'))return json({data:[{id:'100',access_token:'page-token',tasks:['CREATE_CONTENT','MODERATE','MESSAGING']}]});
    if(parsed.pathname.endsWith('/debug_token'))return json({data:{is_valid:true,type:'PAGE',app_id:'app',scopes:['pages_manage_posts'],expires_at:0}});
    return json({id:'100'});
  }) as typeof fetch});
  assert.deepEqual(grant,{pageId:'100',pageToken:'page-token',scopes:['pages_manage_posts'],expiresAt:null});
});
test('Facebook exchange missing actual permissions cannot fall back',async()=>{
  await assert.rejects(exchangeFacebookEngagementGrant({...settings,code:'code',redirectUri:'https://example.test/callback',pageId:'100',fetchImpl:(async(url)=>{
    const parsed=new URL(String(url));
    if(parsed.pathname.endsWith('/oauth/access_token'))return json({access_token:'user-token'});
    if(parsed.pathname.endsWith('/me/accounts'))return json({data:[{id:'100',access_token:'page-token',tasks:['CREATE_CONTENT']}]});
    return json({data:{is_valid:true,type:'PAGE',app_id:'app'}});
  }) as typeof fetch}));
});
