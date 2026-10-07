import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeFacebookEngagementGrant } from '../src/integrations/oauth/facebookEngagementGateway';
const json=(value:unknown)=>new Response(JSON.stringify(value));
const settings={appId:'app',appSecret:'secret',apiVersion:'v20.0'};
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
