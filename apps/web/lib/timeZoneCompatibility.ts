import {canonicalTimeZone} from './timezoneCatalog';
type OffsetProvider = (zoneId: string, instant: string) => number;
// Semantic minimum-runtime checks from IANA NEWS: 2024a, 2025a, 2026b.
// These only decide whether runtime rules may be trusted; they NEVER supply conversion offsets.
const baselineProbes = [
  {zone:'Asia/Almaty',instant:'2026-07-01T12:00:00Z',offset:300},
  {zone:'America/Asuncion',instant:'2026-07-01T12:00:00Z',offset:-180},
  {zone:'America/Vancouver',instant:'2026-11-06T01:00:00Z',offset:-420},
];
const intlOffset: OffsetProvider = (zoneId, instant) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zoneId, timeZoneName: 'longOffset' }).formatToParts(new Date(instant));
  const offset = parts.find(part => part.type === 'timeZoneName')?.value;
  if (offset === 'GMT') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset || '');
  if (!match) throw Error('Offset unavailable');
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
};

// Compatibility probes, NOT conversion rules. A mismatch disables the zone rather than substituting an offset.
export function checkTimeZoneRules(zoneId: string, offsetProvider: OffsetProvider = intlOffset): { supported: boolean; reason?: string } {
  try {
    const formatter=new Intl.DateTimeFormat('en', { timeZone: zoneId });
    formatter.format(0);
    for(const probe of baselineProbes) if(offsetProvider(probe.zone,probe.instant)!==probe.offset)return {supported:false,reason:'rules-outdated'};
    // Intl recognizes legacy/case variants. Its resolved ID is authoritative; never fall back to unprobed raw spelling.
    const canonical=canonicalTimeZone(zoneId) ?? canonicalTimeZone(formatter.resolvedOptions().timeZone) ?? formatter.resolvedOptions().timeZone;
    // IANA 2026c–e changes since the local 2026b baseline. Values are test probes only.
    const probes:Record<string,number>={'America/Winnipeg':-300,'America/Edmonton':-360,'America/Inuvik':-360,'Africa/Casablanca':0,'Africa/El_Aaiun':0};
    if (Object.hasOwn(probes,canonical) && offsetProvider(zoneId, '2026-11-06T01:00:00Z') !== probes[canonical]) {
      return { supported: false, reason: 'rules-outdated' };
    }
    return { supported: true };
  } catch {
    return { supported: false, reason: 'zone-unavailable' };
  }
}
