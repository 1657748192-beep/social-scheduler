import assert from 'node:assert/strict';import test from 'node:test';
import {checkTimeZoneRules} from '../lib/timeZoneCompatibility';
test('shipped rules support all five regions regardless of the browser policy version',()=>{
 for(const id of ['America/Winnipeg','America/Edmonton','America/Inuvik','Africa/Casablanca','Africa/El_Aaiun','CANADA/CENTRAL'])assert.equal(checkTimeZoneRules(id).supported,true);
 assert.equal(checkTimeZoneRules('Unknown/Zone').supported,false);
});
