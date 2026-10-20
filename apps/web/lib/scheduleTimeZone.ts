import { DateTime } from 'luxon';
import { canonicalTimeZone } from './timezoneCatalog';
import { checkTimeZoneRules } from './timeZoneCompatibility';

export type TimeCandidate = { instant: string; offsetMinutes: number };
export type TimeResolution = {kind:'empty'} | {kind:'invalid'; reason:'date'|'zone'|'gap'|'unsupported'} |
  {kind:'ambiguous'; candidates:TimeCandidate[]} | {kind:'resolved'; candidate:TimeCandidate};
export type ScheduleTimeState = { zoneId:string; localValue:string; instant:string|null };
export type ScheduleSubmission = {kind:'draft'} | {kind:'scheduled'; scheduledAt:string; timezone:string} | {kind:'error'; reason:string};
const beijing = 'Asia/Shanghai';
const localFormat = "yyyy-MM-dd'T'HH:mm";

function validZone(id:string):boolean {
  if (id !== 'UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(id)) return false;
  try { return DateTime.now().setZone(id).isValid; } catch { return false; }
}
function readInstant(instant:string):DateTime {
  return /Z$/.test(instant) ? DateTime.fromISO(instant, {zone:'UTC'}) : DateTime.invalid('UTC instant required');
}
export function resolveLocalTime(localValue:string, zoneId:string):TimeResolution {
  if (!localValue) return {kind:'empty'};
  if (!validZone(zoneId)) return {kind:'invalid', reason:'zone'};
  if (!checkTimeZoneRules(zoneId).supported) return {kind:'invalid', reason:'unsupported'};
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue)) return {kind:'invalid', reason:'date'};
  // Validate the calendar separately: fromISO can normalize 24:00.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue)!;
  const [, y, mo, d, h, mi] = match;
  const fields = {year:+y, month:+mo, day:+d, hour:+h, minute:+mi, second:0, millisecond:0};
  if (+h > 23 || +mi > 59 || !DateTime.fromObject(fields, {zone:'UTC'}).isValid) return {kind:'invalid', reason:'date'};
  try {
    const value = DateTime.fromObject(fields, {zone:zoneId});
    if (!value.isValid || value.toFormat(localFormat) !== localValue) return {kind:'invalid', reason:'gap'};
    const candidates = [...new Map(value.getPossibleOffsets()
      .filter(dt => dt.isValid && dt.toFormat(localFormat) === localValue)
      .map(dt => [dt.toMillis(), {instant:dt.toUTC().toISO()!, offsetMinutes:dt.offset}])).values()]
      .sort((a,b) => a.instant.localeCompare(b.instant));
    if (candidates.length === 1) return {kind:'resolved', candidate:candidates[0]};
    if (candidates.length === 2) return {kind:'ambiguous', candidates};
    return {kind:'invalid', reason:'unsupported'};
  } catch { return {kind:'invalid', reason:'unsupported'}; }
}
export function createScheduleTimeState(instant?:string, zoneId = beijing):ScheduleTimeState {
  const zone = canonicalTimeZone(zoneId) ?? zoneId;
  const value = instant ? readInstant(instant) : null;
  return {zoneId:zone, instant:value?.isValid ? instant! : null,
    localValue:value?.isValid && validZone(zone) && checkTimeZoneRules(zone).supported ? value.setZone(zone).toFormat(localFormat) : ''};
}
export function editScheduleLocal(state:ScheduleTimeState, localValue:string):ScheduleTimeState {
  const result = resolveLocalTime(localValue, state.zoneId);
  return {...state, localValue, instant:result.kind === 'resolved' ? result.candidate.instant : null};
}
export function selectScheduleOccurrence(state:ScheduleTimeState, instant:string):ScheduleTimeState {
  const result = resolveLocalTime(state.localValue, state.zoneId);
  return {...state, instant:result.kind === 'ambiguous' && result.candidates.some(c => c.instant === instant) ? instant : null};
}
export function switchScheduleZone(state:ScheduleTimeState, zoneId:string):ScheduleTimeState {
  if (state.instant) {
    const next = createScheduleTimeState(state.instant, zoneId);
    return {...next, localValue:next.localValue || state.localValue};
  }
  return editScheduleLocal({...state, zoneId:canonicalTimeZone(zoneId) ?? zoneId}, state.localValue);
}
export function getScheduleSubmission(state:ScheduleTimeState, nowMs:number):ScheduleSubmission {
  if (!state.localValue && !state.instant) return {kind:'draft'};
  const resolution = resolveLocalTime(state.localValue, state.zoneId);
  if (resolution.kind === 'invalid') return {kind:'error', reason:resolution.reason};
  if (!state.instant || resolution.kind === 'empty') return {kind:'error', reason:'unresolved'};
  const dt = readInstant(state.instant), millis = dt.toMillis();
  const candidates = resolution.kind === 'resolved' ? [resolution.candidate] : resolution.candidates;
  if (!dt.isValid || !candidates.some(c => millis >= Date.parse(c.instant) && millis < Date.parse(c.instant) + 60000)) return {kind:'error', reason:'unresolved'};
  if (!Number.isFinite(nowMs) || millis <= nowMs) return {kind:'error', reason:'past'};
  return {kind:'scheduled', scheduledAt:state.instant, timezone:canonicalTimeZone(state.zoneId) ?? state.zoneId};
}
export function getLocalToday(zoneId:string, nowMs:number):string {
  return validZone(zoneId) ? DateTime.fromMillis(nowMs, {zone:zoneId}).toISODate()! : '';
}
export function formatScheduleTimes(instant:string, zoneId?:string, locale = 'zh-CN'):{localLabel:string|null; beijingLabel:string; dayDelta:number; invalidZone:boolean} {
  const dt = readInstant(instant), china = dt.setZone(beijing), supported = Boolean(zoneId && validZone(zoneId) && checkTimeZoneRules(zoneId).supported);
  const local = supported ? dt.setZone(zoneId!) : null;
  const label = (value:DateTime) => value.isValid ? value.setLocale(locale).toFormat("yyyy-MM-dd HH:mm 'UTC'ZZ") : '—';
  const calendarDay = (value:DateTime) => DateTime.utc(value.year, value.month, value.day).toMillis();
  return {localLabel:local ? label(local) : null, beijingLabel:label(china),
    dayDelta:local?.isValid && china.isValid ? Math.round((calendarDay(china)-calendarDay(local))/86400000) : 0,
    invalidZone:!supported};
}
