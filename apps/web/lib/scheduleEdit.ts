import type {ScheduleTimeState} from './scheduleTimeZone';

export function buildScheduleEdit(original:{scheduledAt:string;timezone:string;text:string}, edited:{time:ScheduleTimeState;text:string}):null|{scheduledAt:string;timezone?:string;text:string}{
  const text=edited.text.trim();
  if (!text || !edited.time.instant) throw Error('A valid time and nonempty text are required');
  const sameInstant=Date.parse(edited.time.instant)===Date.parse(original.scheduledAt);
  if(sameInstant && text===original.text.trim())return null;
  // Omit timezone for text-only edits: server preserves even unknown legacy values, without re-validating or overwriting them.
  return sameInstant?{scheduledAt:original.scheduledAt,text}:{scheduledAt:edited.time.instant,timezone:edited.time.zoneId,text};
}
