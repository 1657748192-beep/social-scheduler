// Development-only, reproducible source generation. Never shipped as a runtime fetch.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../apps/web/lib/timezones');
const sources = {
  zones: 'https://data.iana.org/time-zones/tzdb-2026e/zone.tab',
  aliases: 'https://data.iana.org/time-zones/tzdb-2026e/backward',
  zhZones: 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-dates-full/main/zh/timeZoneNames.json',
  enZones: 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-dates-full/main/en/timeZoneNames.json',
  zhCountries: 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-localenames-full/main/zh/territories.json',
  enCountries: 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/cldr-json/cldr-localenames-full/main/en/territories.json',
  license: 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.2.3/LICENSE',
};
async function main() {
  const raw = Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([key, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw Error(`${key}: HTTP ${response.status}`);
    return [key, await response.text()];
  })));
  const hashes = Object.fromEntries(Object.entries(raw).map(([key, data]) => [key, crypto.createHash('sha256').update(data).digest('hex')]));
  const metadata = { iana: '2026e', cldr: '48.2.3', sources, sha256: hashes };
  const oldMetadataPath = path.join(root, 'sources.json');
  if (fs.existsSync(oldMetadataPath)) {
    const old = JSON.parse(fs.readFileSync(oldMetadataPath, 'utf8'));
    if (JSON.stringify(old.sha256) !== JSON.stringify(hashes)) throw Error('Pinned upstream content changed; review versions and hashes before regeneration');
  }
  const zones = locale => JSON.parse(raw[locale + 'Zones']).main[locale].dates.timeZoneNames.zone;
  const countries = locale => JSON.parse(raw[locale + 'Countries']).main[locale].localeDisplayNames.territories;
  const byLocale = { zh: zones('zh'), en: zones('en') }, countryNames = { zh: countries('zh'), en: countries('en') };
  const links = Object.fromEntries(raw.aliases.split('\n').filter(l => /^Link\s/.test(l)).map(l => { const [, target, alias] = l.split(/\s+/); return [alias, target]; }));
  const canonical = id => { const seen = new Set(); while (links[id] && !seen.has(id)) { seen.add(id); id = links[id]; } return id; };
  const city = (id, locale) => {
    const node = id.split('/').reduce((obj, part) => obj?.[part], byLocale[locale]);
    return node?.exemplarCity || id.split('/').at(-1).replaceAll('_', ' ');
  };
  const entries = raw.zones.split('\n').filter(l => l && !l.startsWith('#')).map(line => {
    const [countryCode, , rawId] = line.split('\t'), zoneId = canonical(rawId);
    return { zoneId, countryCode, countryZh: countryNames.zh[countryCode] || countryCode, countryEn: countryNames.en[countryCode] || countryCode, cityZh: city(zoneId, 'zh'), cityEn: city(zoneId, 'en') };
  });
  entries.push({ zoneId: 'UTC', countryCode: '001', countryZh: '全球', countryEn: 'World', cityZh: '协调世界时', cityEn: 'Coordinated Universal Time' });
  const ids = new Set(entries.map(e => e.zoneId));
  const aliases = Object.fromEntries(Object.keys(links).sort().map(id => [id, canonical(id)]).filter(([, target]) => ids.has(target)));
  aliases['Etc/UTC'] = 'UTC'; aliases['Etc/GMT'] = 'UTC';
  const outputs = {
    'catalog.json': JSON.stringify({ entries, aliases }) + '\n',
    'sources.json': JSON.stringify(metadata, null, 2) + '\n',
    'LICENSES.txt': 'IANA zone.tab and backward: public domain as stated in the source headers.\n\nUnicode CLDR JSON license (unmodified):\n\n' + raw.license,
  };
  fs.mkdirSync(root, { recursive: true });
  for (const [name, data] of Object.entries(outputs)) {
    const file = path.join(root, name);
    if (process.argv.includes('--check')) { if (fs.readFileSync(file, 'utf8') !== data) throw Error(`${name} differs`); }
    else fs.writeFileSync(file, data);
  }
  console.log(`${entries.length} region/city entries; IANA 2026e / CLDR 48.2.3${process.argv.includes('--check') ? ' verified' : ' generated'}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
