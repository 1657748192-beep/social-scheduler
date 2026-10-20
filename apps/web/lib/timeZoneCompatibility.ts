import {canonicalTimeZone} from './timezoneCatalog';
type OffsetProvider = (zoneId: string, instant: string) => number;
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
    new Intl.DateTimeFormat('en', { timeZone: zoneId }).format(0);
    const canonical=canonicalTimeZone(zoneId) ?? zoneId;
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
