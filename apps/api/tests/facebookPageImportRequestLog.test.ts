import test from 'node:test';import assert from 'node:assert/strict';import {safeRequestLogUrl} from '../src/utils/requestLog';
test('invitation request logs contain no opaque identifiers or callback queries',()=>{
 assert.doesNotMatch(safeRequestLogUrl('/api/v1/workspaces/private-workspace/facebook-page-import-invitations/private-invite/confirm?secret=secret-value'),/private-workspace|private-invite|secret-value/);
 assert.doesNotMatch(safeRequestLogUrl('/api/v1/facebook-page-import-public/exchange?secret=secret-value'),/secret-value/);
 assert.doesNotMatch(safeRequestLogUrl('/api/v1/integrations/facebook/oauth/callback?state=fbpi_private&code=private-code'),/private/);
});
