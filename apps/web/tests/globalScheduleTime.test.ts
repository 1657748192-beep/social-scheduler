import assert from 'node:assert/strict';
import test from 'node:test';
import { createScheduleTimeState, editScheduleLocal, formatScheduleTimes, getLocalToday, getScheduleSubmission, resolveLocalTime, selectScheduleOccurrence, switchScheduleZone } from '../lib/scheduleTimeZone';

test('local input resolves to the same independently calculated UTC and Beijing preview', () => {
  for (const [zone, instant, beijing] of [
    ['Asia/Shanghai', '2026-10-20T12:00:00.000Z', '2026-10-20 20:00'],
    ['America/New_York', '2026-10-21T00:00:00.000Z', '2026-10-21 08:00'],
    ['Asia/Kathmandu', '2026-10-20T14:15:00.000Z', '2026-10-20 22:15'],
  ]) {
    const state = editScheduleLocal(createScheduleTimeState(undefined, zone), '2026-10-20T20:00');
    assert.equal(state.instant, instant);
    assert.ok(formatScheduleTimes(instant, zone).beijingLabel.includes(beijing));
  }
  assert.equal(formatScheduleTimes('2026-10-21T00:00:00.000Z', 'America/New_York').dayDelta, 1);
});

test('DST gaps, skipped dates and impossible calendar dates never normalize to another time', () => {
  for (const [zone, local, reason] of [
    ['America/New_York', '2026-03-08T02:30', 'gap'],
    ['Australia/Lord_Howe', '2026-10-04T02:15', 'gap'],
    ['Pacific/Apia', '2011-12-30T12:00', 'gap'],
    ['Asia/Shanghai', '2026-02-30T12:00', 'date'],
    ['Asia/Shanghai', '2026-10-20T24:00', 'date'],
    ['Unknown/Zone', '2026-10-20T12:00', 'zone'],
  ]) assert.deepEqual(resolveLocalTime(local, zone), {kind:'invalid', reason});
});

test('repeated hour has two explicit occurrences and editing clears the previous choice', () => {
  let state = editScheduleLocal(createScheduleTimeState(undefined, 'America/New_York'), '2026-11-01T01:30');
  assert.equal(state.instant, null);
  const result = resolveLocalTime(state.localValue, state.zoneId);
  assert.equal(result.kind, 'ambiguous');
  if (result.kind !== 'ambiguous') return;
  assert.deepEqual(result.candidates.map(c => c.instant), ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
  state = selectScheduleOccurrence(state, result.candidates[1].instant);
  assert.equal(state.instant, '2026-11-01T06:30:00.000Z');
  assert.equal(getScheduleSubmission(state, Date.parse('2026-11-01T06:00Z')).kind, 'scheduled');
  assert.equal(getScheduleSubmission(state, Date.parse('2026-11-01T06:31Z')).kind, 'error');
  assert.equal(getScheduleSubmission(selectScheduleOccurrence(state, result.candidates[0].instant), Date.parse('2026-11-01T06:00Z')).kind, 'error');
  assert.equal(editScheduleLocal(state, state.localValue).instant, null);
  assert.equal(selectScheduleOccurrence(state, '2026-11-01T07:30:00.000Z').instant, null);
});

test('switching display zones preserves exact old seconds and milliseconds, but explicit editing uses minutes', () => {
  const original = '2099-01-01T12:00:27.123Z';
  let state = createScheduleTimeState(original, 'America/New_York');
  state = switchScheduleZone(state, 'Asia/Tokyo');
  assert.equal(state.instant, original);
  assert.equal(state.localValue, '2099-01-01T21:00');
  assert.equal(editScheduleLocal(state, state.localValue).instant, '2099-01-01T12:00:00.000Z');
  const incomplete = {zoneId:'Asia/Shanghai', localValue:'2099-01-01T:', instant:null};
  assert.equal(switchScheduleZone(incomplete, 'Asia/Tokyo').localValue, incomplete.localValue);
});

test('empty is draft, nonempty invalid blocks, target today and legacy display use explicit zones', () => {
  assert.deepEqual(getScheduleSubmission(createScheduleTimeState(), 0), {kind:'draft'});
  assert.equal(getScheduleSubmission(editScheduleLocal(createScheduleTimeState(), '2026-'), 0).kind, 'error');
  const now = Date.parse('2026-10-20T01:00:00Z');
  assert.equal(getLocalToday('America/Los_Angeles', now), '2026-10-19');
  assert.equal(getLocalToday('Pacific/Kiritimati', now), '2026-10-20');
  const legacy = formatScheduleTimes('2026-10-20T12:00:00Z', 'Unknown/Zone');
  assert.equal(legacy.invalidZone, true);
  assert.equal(legacy.localLabel, null);
  assert.ok(legacy.beijingLabel.includes('2026-10-20 20:00'));
});
