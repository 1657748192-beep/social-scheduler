import assert from 'node:assert/strict';
import test from 'node:test';
import {createFacebookManagementGateway} from '../src/facebookManagement/oauthGateway';
const config={enabled:true,appId:'123',graphVersion:'v26.0',loginConfigId:'456',callbackUrl:'https://example.test/api/v1/integrations/facebook-management/oauth/callback'};
function gateway(options:{wrongApp?:boolean;wrongUser?:boolean;numericPageApp?:boolean;failure?:boolean}={}){
  let calls=0;
  const fetchImpl=async(raw:any,init:any)=>{
    const url=new URL(String(raw));calls++;assert.equal(url.origin,'https://graph.facebook.com');assert.equal(init.redirect,'error');assert.ok(init.signal);
    if(options.failure)throw Error('user-secret app-secret code-secret');
    let data:unknown;
    if(url.pathname.endsWith('/oauth/access_token')){
      assert.equal(url.searchParams.get('client_id'),'123');assert.equal(url.searchParams.get('client_secret'),'app-secret');assert.equal(url.searchParams.get('code'),'code-secret');assert.equal(url.searchParams.get('redirect_uri'),config.callbackUrl);
      data={access_token:'user-secret',token_type:'Bearer',expires_in:3600};
    }else if(url.pathname.endsWith('/debug_token')){
      assert.equal(init.headers.Authorization,'Bearer 123|app-secret');
      const page=url.searchParams.get('input_token')==='page-secret';
      data={data:{app_id:options.wrongApp?'999':page&&options.numericPageApp?123:'123',is_valid:true,...(page?{profile_id:'100'}:{user_id:'200'}),scopes:page?['pages_messaging']:['business_management','pages_show_list'],expires_at:page?0:Math.floor(Date.now()/1000)+3600}};
    }else if(url.pathname.endsWith('/me/accounts')){
      assert.equal(init.headers.Authorization,'Bearer user-secret');data={data:[{id:'100',name:'Page',link:'https://www.facebook.com/100',access_token:'page-secret',tasks:['MESSAGING','MODERATE']}]};
    }else if(url.pathname.endsWith('/me')){data={id:init.headers.Authorization==='Bearer page-secret'?'100':options.wrongUser?'999':'200'};}
    else throw Error('Unexpected request');
    return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
  };
  return {api:createFacebookManagementGateway({config,appSecret:'app-secret',fetchImpl:fetchImpl as typeof fetch}),calls:()=>calls};
}
test('independentGatewayPersistsOnlyVerifiedActualGrants',async()=>{
  const {api}=gateway();const result=await api.exchange('code-secret',config.callbackUrl);
  assert.equal(result.appId,'123');assert.equal(result.providerUserId,'200');assert.equal(result.userToken,'user-secret');
  assert.deepEqual(result.scopes,['business_management','pages_show_list']);assert.equal(result.pages[0].pageId,'100');assert.equal(result.pages[0].pageToken,'page-secret');assert.deepEqual(result.pages[0].scopes,['pages_messaging']);
});
test('wrongAppUserAndCallbackFailWithoutReflectingSecrets',async()=>{
  for(const options of [{wrongApp:true},{wrongUser:true},{failure:true}]){
    const {api}=gateway(options);await assert.rejects(api.exchange('code-secret',config.callbackUrl),e=>!/(user-secret|app-secret|code-secret)/.test(String(e)));
  }
  const f=gateway();await assert.rejects(f.api.exchange('code-secret','https://evil.test/callback'));assert.equal(f.calls(),0);
});
test('documentedNumericAppIdentityIsNormalizedWithoutWeakeningIdentityChecks',async()=>{
  const page=(await gateway({numericPageApp:true}).api.exchange('code-secret',config.callbackUrl)).pages[0];
  assert.equal(page.pageId,'100');assert.equal(page.pageToken,'page-secret');assert.deepEqual(page.scopes,['pages_messaging']);
});
