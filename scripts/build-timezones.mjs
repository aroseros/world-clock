import { readFile, readdir, rm, writeFile } from 'node:fs/promises';

const aliases = JSON.parse(
  await readFile(new URL('../data/timezone-aliases.json', import.meta.url), 'utf8'),
);
const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

function parseZoneTab(text) {
  return text
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [countryCodes, , timezone, comment = ''] = line.split('\t');
      const countryCode = countryCodes.split(',')[0];
      const city = timezone.split('/').at(-1).replaceAll('_', ' ');
      const country = displayNames.of(countryCode) || countryCode;
      const region = timezone.split('/')[0].replaceAll('_', ' ');
      const recordAliases = [...new Set([
        region,
        comment,
        ...(aliases[timezone] || []),
      ].filter(Boolean))];
      return { timezone, city, country, countryCode, aliases: recordAliases };
    });
}

let records;
try {
  const zoneTab = await readFile('/usr/share/zoneinfo/zone.tab', 'utf8');
  records = parseZoneTab(zoneTab);
} catch {
  records = Intl.supportedValuesOf('timeZone').map((timezone) => ({
    timezone,
    city: timezone.split('/').at(-1).replaceAll('_', ' '),
    country: timezone.split('/')[0].replaceAll('_', ' '),
    countryCode: '',
    aliases: aliases[timezone] || [],
  }));
}

records = records
  .filter((record, index, all) =>
    !record.timezone.startsWith('Etc/')
    && all.findIndex((candidate) => candidate.timezone === record.timezone) === index
  )
  .sort((a, b) => a.city.localeCompare(b.city, 'en'));

for (const record of records) {
  record.searchText = [
    record.timezone,
    record.city,
    record.country,
    record.countryCode,
    ...record.aliases,
  ].join(' ').toLocaleLowerCase('en');
}

const dataDirectory = new URL('../data/', import.meta.url);
for (const filename of await readdir(dataDirectory)) {
  if (filename === 'timezones.json' || /^timezones-\d+\.json$/.test(filename)) {
    await rm(new URL(filename, dataDirectory), { force: true });
  }
}

const partSize = 32;
const filenames = [];
for (let index = 0; index < records.length; index += partSize) {
  const filename = `timezones-${String(filenames.length + 1).padStart(2, '0')}.json`;
  filenames.push(filename);
  await writeFile(
    new URL(filename, dataDirectory),
    `${JSON.stringify(records.slice(index, index + partSize), null, 2)}\n`,
  );
}
await writeFile(
  new URL('timezones-index.json', dataDirectory),
  `${JSON.stringify(filenames, null, 2)}\n`,
);
console.log(`Wrote ${records.length} timezone records across ${filenames.length} files.`);
