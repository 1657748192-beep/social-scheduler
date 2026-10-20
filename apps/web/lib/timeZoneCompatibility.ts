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
    if (zoneId === 'America/Winnipeg' && offsetProvider(zoneId, '2026-11-06T01:00:00Z') !== -300) {
      return { supported: false, reason: 'rules-outdated' };
    }
    return { supported: true };
  } catch {
    return { supported: false, reason: 'zone-unavailable' };
  }
}
