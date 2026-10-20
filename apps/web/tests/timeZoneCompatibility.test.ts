import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTimeZoneRules } from '../lib/timeZoneCompatibility';

test('stale Manitoba rules reject new selections instead of silently scheduling one hour late', () => {
  // External boundary: a browser may carry outdated ICU. Independent IANA 2026e expectation is -300.
  assert.equal(checkTimeZoneRules('America/Winnipeg', () => -360).supported, false);
  assert.equal(checkTimeZoneRules('America/Winnipeg', () => -300).supported, true);
});

test('unsupported Intl zones and throwing rule providers fail closed', () => {
  assert.equal(checkTimeZoneRules('Unknown/Zone').supported, false);
  assert.equal(checkTimeZoneRules('America/Winnipeg', () => { throw Error('Intl unavailable'); }).supported, false);
  assert.equal(checkTimeZoneRules('Asia/Shanghai').supported, true);
});
