const datasetPromises = new Map();

const SCORE = Object.freeze({
  exactTimezone: 1000,
  exactCity: 900,
  exactAlias: 850,
  cityPrefix: 700,
  timezonePrefix: 650,
  countryExact: 600,
  tokenPrefix: 400,
  contains: 200,
});

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('_', ' ')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim();
}

function preparedRecord(record) {
  const timezone = normalizeSearchText(record.timezone);
  const city = normalizeSearchText(record.city);
  const country = normalizeSearchText(record.country);
  const aliases = (record.aliases || []).map(normalizeSearchText);
  const combined = normalizeSearchText(record.searchText || [
    record.timezone,
    record.city,
    record.country,
    record.countryCode,
    ...(record.aliases || []),
  ].join(' '));
  const tokens = normalizeSearchText([
    record.timezone?.replaceAll('/', ' '),
    record.city,
    record.country,
    record.countryCode,
    ...(record.aliases || []),
  ].join(' ')).split(' ').filter(Boolean);
  return { timezone, city, country, aliases, combined, tokens };
}

function scoreRecord(record, query) {
  if (!query) return 0;
  const prepared = preparedRecord(record);
  if (prepared.timezone === query) return SCORE.exactTimezone;
  if (prepared.city === query) return SCORE.exactCity;
  if (prepared.aliases.includes(query)) return SCORE.exactAlias;
  if (prepared.city.startsWith(query)) return SCORE.cityPrefix;
  if (prepared.timezone.startsWith(query)) return SCORE.timezonePrefix;
  if (prepared.country === query) return SCORE.countryExact;
  if (prepared.tokens.some((token) => token.startsWith(query))) return SCORE.tokenPrefix;
  if (prepared.combined.includes(query)) return SCORE.contains;
  return -1;
}

export function searchTimezones(records, query, {
  excludedTimezones = new Set(),
  limit = 8,
} = {}) {
  const normalizedQuery = normalizeSearchText(query);
  const seen = new Set();
  return records
    .filter((record) => {
      if (!record?.timezone || excludedTimezones.has(record.timezone) || seen.has(record.timezone)) return false;
      seen.add(record.timezone);
      return true;
    })
    .map((record, index) => ({ record, index, score: scoreRecord(record, normalizedQuery) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const cityCompare = String(left.record.city).localeCompare(String(right.record.city), 'en');
      if (cityCompare !== 0) return cityCompare;
      const timezoneCompare = left.record.timezone.localeCompare(right.record.timezone, 'en');
      return timezoneCompare || left.index - right.index;
    })
    .slice(0, Math.max(0, limit))
    .map(({ record }) => record);
}

export function findTimezoneRecord(records, timezone) {
  return records.find((record) => record.timezone === timezone) || null;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Timezone dataset failed to load (${response.status}).`);
  return response.json();
}

export function loadTimezoneDataset(url) {
  const resolvedUrl = url || globalThis.chrome?.runtime?.getURL?.('data/timezones-index.json');
  if (!resolvedUrl) {
    return Promise.reject(new Error('A packaged timezone dataset URL is required.'));
  }
  if (!datasetPromises.has(resolvedUrl)) {
    datasetPromises.set(resolvedUrl, fetchJson(resolvedUrl).then(async (payload) => {
      if (!Array.isArray(payload)) throw new TypeError('Timezone dataset must be an array.');
      if (!payload.every((entry) => typeof entry === 'string')) return payload;

      const parts = await Promise.all(payload.map(async (part) => {
        const partUrl = new URL(part, resolvedUrl).toString();
        const records = await fetchJson(partUrl);
        if (!Array.isArray(records)) throw new TypeError('Timezone dataset part must be an array.');
        return records;
      }));
      return parts.flat();
    }).catch((error) => {
      datasetPromises.delete(resolvedUrl);
      throw error;
    }));
  }
  return datasetPromises.get(resolvedUrl);
}
