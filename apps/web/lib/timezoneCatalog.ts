import catalog from './timezones/catalog.json';

export type TimeZoneEntry = { zoneId: string; sourceZoneId:string; countryCode: string; countryZh: string; countryEn: string; cityZh: string; cityEn: string; searchAliases:string[] };
export const commonTimeZones = ['Asia/Shanghai', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney', 'Asia/Dubai'];
export const timeZoneEntries: readonly TimeZoneEntry[] = catalog.entries;
const ids = new Set(timeZoneEntries.map(entry => entry.zoneId));
const aliases: Record<string, string> = catalog.aliases;
export function canonicalTimeZone(id: string): string | null {
  return ids.has(id) ? id : Object.hasOwn(aliases, id) ? aliases[id] : null;
}
export function searchTimeZones(query: string): TimeZoneEntry[] {
  const q = query.trim().toLocaleLowerCase().replaceAll('_', ' ');
  return timeZoneEntries.filter(entry => Object.values(entry).join(' ').toLocaleLowerCase().replaceAll('_', ' ').includes(q))
    .sort((a, b) => {
      const ai = commonTimeZones.indexOf(a.zoneId), bi = commonTimeZones.indexOf(b.zoneId);
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.zoneId.localeCompare(b.zoneId) || a.countryCode.localeCompare(b.countryCode);
    });
}
