import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findTimezoneRecord,
  loadTimezoneDataset,
  normalizeSearchText,
  searchTimezones,
} from '../shared/search.js';

const records = [
  { timezone: 'Asia/Baghdad', city: 'Baghdad', country: 'Iraq', countryCode: 'IQ', aliases: ['Erbil', 'Slemani'] },
  { timezone: 'Europe/London', city: 'London', country: 'United Kingdom', countryCode: 'GB', aliases: ['UK', 'GMT'] },
  { timezone: 'America/New_York', city: 'New York', country: 'United States', countryCode: 'US', aliases: ['NYC', 'ET'] },
];

test('ranks exact timezone, city, alias, and country matches', () => {
  assert.equal(searchTimezones(records, 'Asia/Baghdad')[0].timezone, 'Asia/Baghdad');
  assert.equal(searchTimezones(records, 'London')[0].timezone, 'Europe/London');
  assert.equal(searchTimezones(records, 'Erbil')[0].timezone, 'Asia/Baghdad');
  assert.equal(searchTimezones(records, 'Iraq')[0].timezone, 'Asia/Baghdad');
});

test('excludes already-saved timezones and limits results', () => {
  const result = searchTimezones(records, '', {
    excludedTimezones: new Set(['Asia/Baghdad']),
    limit: 1,
  });
  assert.equal(result.length, 1);
  assert.notEqual(result[0].timezone, 'Asia/Baghdad');
});

test('normalizes diacritics, underscores, and whitespace', () => {
  assert.equal(normalizeSearchText('  São_Paulo  '), 'sao paulo');
});

test('finds a canonical dataset record', () => {
  assert.equal(findTimezoneRecord(records, 'Europe/London')?.city, 'London');
  assert.equal(findTimezoneRecord(records, 'Not/AZone'), null);
});

test('loads and flattens a packaged timezone index', async () => {
  const originalFetch = globalThis.fetch;
  const responses = new Map([
    ['https://extension.test/data/timezones-index.json', ['timezones-asia.json', 'timezones-europe.json']],
    ['https://extension.test/data/timezones-asia.json', [records[0]]],
    ['https://extension.test/data/timezones-europe.json', [records[1]]],
  ]);
  globalThis.fetch = async (url) => ({
    ok: responses.has(String(url)),
    status: responses.has(String(url)) ? 200 : 404,
    async json() { return responses.get(String(url)); },
  });

  try {
    const result = await loadTimezoneDataset('https://extension.test/data/timezones-index.json');
    assert.deepEqual(result.map(({ timezone }) => timezone), ['Asia/Baghdad', 'Europe/London']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
