import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeFacebookEngagementGrant } from '../src/integrations/oauth/facebookEngagementGateway';
import * as gateway from '../src/integrations/oauth/facebookEngagementGateway';
import { HttpError } from '../src/utils/errors';
const json=(value:unknown)=>new Response(JSON.stringify(value));
const settings={appId:'app',appSecret:'secret',apiVersion:'v20.0'};
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
