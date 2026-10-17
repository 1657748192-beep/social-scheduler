import assert from 'node:assert/strict';
import test from 'node:test';
import {safeRequestLogUrl} from '../src/utils/requestLog';
test('sync request logging strips opaque IDs and all queries while retaining route actions',()=>{
 for(const action of ['','/confirm'])assert.equal(safeRequestLogUrl('/api/v1/workspaces/w1/facebook-page-sync/sensitive-sync-id'+action+'?token=secret'),'/api/v1/workspaces/w1/facebook-page-sync/[redacted]'+action);
 assert.equal(safeRequestLogUrl('/api/v1/workspaces/w1/facebook-page-sync/start?code=secret'),'/api/v1/workspaces/w1/facebook-page-sync/start');
 assert.equal(safeRequestLogUrl('/api/v1/integrations/facebook/oauth/callback?state=fbps_secret&code=secret'),'/api/v1/integrations/facebook/oauth/callback');
});
