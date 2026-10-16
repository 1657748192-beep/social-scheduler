import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';

test('server compose passes only independent management configuration to API and leaves Worker unchanged',()=>{
  const render=(enabled?:string)=>JSON.parse(execFileSync('docker',['compose','-f','docker-compose.yml','-f','docker-compose.server.yml','config','--format','json'],{encoding:'utf8',env:{...process.env,FACEBOOK_MANAGEMENT_ENABLED:enabled??'',FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID:'987654321',FACEBOOK_MANAGEMENT_GRAPH_API_VERSION:'v26.0',FACEBOOK_MANAGEMENT_CALLBACK_URL:'https://example.test/api/v1/integrations/facebook-management/oauth/callback',FACEBOOK_LOGIN_CONFIG_ID:'111',FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID:'222'},stdio:['ignore','pipe','pipe']}));
  const enabled=render('true');
  assert.equal(enabled.services.api.environment.FACEBOOK_MANAGEMENT_ENABLED,'true');
  assert.equal(enabled.services.api.environment.FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID,'987654321');
  assert.equal(enabled.services.api.environment.FACEBOOK_MANAGEMENT_GRAPH_API_VERSION,'v26.0');
  assert.equal(enabled.services.api.environment.FACEBOOK_MANAGEMENT_CALLBACK_URL,'https://example.test/api/v1/integrations/facebook-management/oauth/callback');
  assert.equal(enabled.services.api.environment.FACEBOOK_LOGIN_CONFIG_ID,'111');
  assert.equal(enabled.services.api.environment.FACEBOOK_ENGAGEMENT_LOGIN_CONFIG_ID,'222');
  for(const service of ['worker','web'])assert.ok(!Object.keys(enabled.services[service].environment).some(k=>k.startsWith('FACEBOOK_MANAGEMENT_')));
  assert.equal(render().services.api.environment.FACEBOOK_MANAGEMENT_ENABLED,'false');
});
