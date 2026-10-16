import assert from 'node:assert/strict';
import test from 'node:test';
import {getFacebookManagementConfig} from '../src/facebookManagement/config';

const valid = {
  FACEBOOK_MANAGEMENT_ENABLED: 'true', FACEBOOK_CLIENT_ID:'123456', FACEBOOK_CLIENT_SECRET:'test-secret',
  FACEBOOK_LOGIN_CONFIG_ID:'111111', FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID:'222222',
  FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID:'333333', FACEBOOK_MANAGEMENT_GRAPH_API_VERSION:'v26.0',
  FACEBOOK_MANAGEMENT_CALLBACK_URL:'https://app.example.test/api/v1/integrations/facebook-management/oauth/callback',
  PUBLIC_API_URL:'https://app.example.test',
};

test('independent configuration never falls back to the publishing or old engagement config',()=>{
  const env={...valid,FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID:''};
  const original={...env};
  assert.throws(()=>getFacebookManagementConfig(env),/configuration/i);
  assert.deepEqual(env,original);
  for (const id of ['111111','222222']) {
    assert.throws(()=>getFacebookManagementConfig({...valid,FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID:id}),/configuration/i);
  }
});

test('disabled management requires no credentials and never mutates the environment',()=>{
  for(const value of [undefined,'false']) {
    const env={FACEBOOK_MANAGEMENT_ENABLED:value,FACEBOOK_CLIENT_SECRET:'do-not-expose'};
    const before={...env};
    assert.deepEqual(getFacebookManagementConfig(env),{
      enabled:false,appId:'',graphVersion:'',loginConfigId:'',callbackUrl:'',
    });
    assert.deepEqual(env,before);
  }
  assert.throws(()=>getFacebookManagementConfig({...valid,FACEBOOK_MANAGEMENT_ENABLED:'yes'}),/configuration/i);
});

test('valid independent configuration returns only safe configuration metadata',()=>{
  const before={...valid};
  assert.deepEqual(getFacebookManagementConfig(valid),{
    enabled:true,appId:'123456',graphVersion:'v26.0',loginConfigId:'333333',
    callbackUrl:'https://app.example.test/api/v1/integrations/facebook-management/oauth/callback',
  });
  assert.deepEqual(valid,before);
});

test('container API_PUBLIC_URL is accepted without requiring the host compose variable',()=>{
  const env={...valid,PUBLIC_API_URL:undefined,API_PUBLIC_URL:'https://app.example.test'};
  assert.equal(getFacebookManagementConfig(env).enabled,true);
  assert.throws(()=>getFacebookManagementConfig({...env,API_PUBLIC_URL:'https://other.example.test'}),/configuration/i);
});

test('invalid or incomplete independent settings fail closed without reflecting secrets',()=>{
  const changes=[
    {FACEBOOK_CLIENT_ID:''},{FACEBOOK_CLIENT_SECRET:''},{FACEBOOK_MANAGEMENT_GRAPH_API_VERSION:''},
    {FACEBOOK_MANAGEMENT_GRAPH_API_VERSION:'v26.0/path'}, {FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID:'bad'},
    {FACEBOOK_MANAGEMENT_CALLBACK_URL:'http://app.example.test/api/v1/integrations/facebook-management/oauth/callback'},
    {FACEBOOK_MANAGEMENT_CALLBACK_URL:'https://app.example.test/api/v1/integrations/facebook/oauth/callback'},
    {FACEBOOK_MANAGEMENT_CALLBACK_URL:'https://evil.example.test/api/v1/integrations/facebook-management/oauth/callback'},
    {FACEBOOK_MANAGEMENT_CALLBACK_URL:valid.FACEBOOK_MANAGEMENT_CALLBACK_URL+'?secret=do-not-expose'},
    {FACEBOOK_MANAGEMENT_CALLBACK_URL:valid.FACEBOOK_MANAGEMENT_CALLBACK_URL+'#fragment'},
    {FACEBOOK_MANAGEMENT_CALLBACK_URL:'https://user:do-not-expose@app.example.test/api/v1/integrations/facebook-management/oauth/callback'},
  ];
  for(const change of changes) {
    assert.throws(()=>getFacebookManagementConfig({...valid,...change}),error=>{
      assert.ok(error instanceof Error);
      assert.match(error.message,/configuration/i);
      assert.doesNotMatch(error.message,/do-not-expose|test-secret|evil\.example/);
      return true;
    });
  }
});
