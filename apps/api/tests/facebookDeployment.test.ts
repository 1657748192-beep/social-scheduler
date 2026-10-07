import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
test('Facebook server services receive the same disabled-by-default feature configuration',()=>{
  const run=(extra:Record<string,string>)=>JSON.parse(execFileSync('docker',['compose','--env-file','.env.example','-f','docker-compose.yml','-f','docker-compose.server.yml','config','--format','json'],{encoding:'utf8',env:{...process.env,...extra},stdio:['ignore','pipe','pipe']}));
  for(const enabled of ['false','true']){
    const config=run({FACEBOOK_ENGAGEMENT_ENABLED:enabled,FACEBOOK_GRAPH_API_VERSION:'v26.0',FACEBOOK_WEBHOOK_VERIFY_TOKEN:'fake-verification'});
    for(const service of ['api','worker']){
      assert.equal(config.services[service].environment.FACEBOOK_ENGAGEMENT_ENABLED,enabled);
      assert.equal(config.services[service].environment.FACEBOOK_GRAPH_API_VERSION,'v26.0');
      assert.equal(config.services[service].environment.FACEBOOK_WEBHOOK_VERIFY_TOKEN,'fake-verification');
    }
  }
});
