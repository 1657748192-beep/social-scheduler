import assert from 'node:assert/strict';
import test from 'node:test';
import {safeRequestLogUrl} from '../src/utils/requestLog';
test('managementAuthorizationLogsDoNotContainCodeStateOrTokens',()=>{
  for(const path of ['/api/v1/integrations/facebook-management/oauth/callback','/api/v1/integrations/facebook-management/OAUTH/CALLBACK/','/api/v1/workspaces/w/facebook-management/oauth/start']){
    assert.equal(safeRequestLogUrl(`${path}?code=secret-code&state=secret-state&access_token=secret-token`),path);
  }
});
