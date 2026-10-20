import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalTimeZone, searchTimeZones, timeZoneEntries } from '../lib/timezoneCatalog';

test('catalog lets users distinguish cities in a multi-zone country and search both languages', () => {
  assert.ok(timeZoneEntries.length > 400);
  for (const query of ['纽约', 'New York', 'America/New_York']) {
    assert.ok(searchTimeZones(query).some(e => e.zoneId === 'America/New_York'));
  }
  const us = searchTimeZones('美国');
  assert.ok(us.some(e => e.zoneId === 'America/New_York'));
  assert.ok(us.some(e => e.zoneId === 'America/Los_Angeles'));
  assert.equal(searchTimeZones('not-a-city-xyz').length, 0);
  assert.ok(searchTimeZones('UTC').some(e => e.zoneId === 'UTC'));
});

test('catalog resolves explicit historical aliases without accepting invented or ambiguous zones', () => {
  assert.equal(canonicalTimeZone('US/Eastern'), 'America/New_York');
  assert.equal(canonicalTimeZone('Asia/Calcutta'), 'Asia/Kolkata');
  assert.equal(canonicalTimeZone('UTC'), 'UTC');
  for (const id of ['CST', 'UTC+8', 'america/new_york', 'Unknown/Zone', '']) assert.equal(canonicalTimeZone(id), null);
});
