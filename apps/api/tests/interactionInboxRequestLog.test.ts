import test from 'node:test';import assert from 'node:assert/strict';import {safeRequestLogUrl} from '../src/utils/requestLog';
test('interaction logs never include workspace customer IDs or search parameters',()=>{
 const value=safeRequestLogUrl('/api/v1/workspaces/private-workspace/interaction-inbox/customers/private-customer?accountIds=secret-account&q=private-name');assert.doesNotMatch(value,/private-|secret-|q=/);assert.match(value,/interaction-inbox/);
});
