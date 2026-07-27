import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultConfig,
  normalizeConfig,
  validateConfigForWrite,
} from '../shared/settings.js';

test('creates a valid local-only incomplete onboarding config', () => {
  const config = createDefaultConfig('Asia/Baghdad', {
    city: 'Baghdad',
    country: 'Iraq',
  });

  assert.equal(config.schemaVersion, 1);
  assert.equal(config.onboardingComplete, false);
  assert.equal(config.settings.timeFormat, '24h');
  assert.equal(config.settings.defaultClockStyle, 'combined');
  assert.equal(config.locations[0].timezone, 'Asia/Baghdad');
  assert.equal(config.locations[0].order, 0);
});

test('normalization removes invalid and duplicate locations without discarding valid data', () => {
  const { config, issues } = normalizeConfig({
    schemaVersion: 1,
    onboardingComplete: true,
    settings: { timeFormat: '12h', unknown: 'ignored' },
    locations: [
      { id: 'a', timezone: 'Europe/London', city: 'London', country: 'United Kingdom', order: 4 },
      { id: 'b', timezone: 'Europe/London', city: 'Duplicate', country: 'United Kingdom', order: 1 },
      { id: 'c', timezone: 'Not/AZone', city: 'Broken', country: 'Nowhere', order: 2 },
    ],
    unknownRoot: true,
  }, 'Asia/Baghdad');

  assert.equal(config.locations.length, 1);
  assert.equal(config.locations[0].order, 0);
  assert.equal(config.settings.timeFormat, '12h');
  assert.ok(issues.some((issue) => issue.code === 'duplicate-timezone'));
  assert.ok(issues.some((issue) => issue.code === 'invalid-timezone'));
});

test('write validation rejects more than 24 locations', () => {
  const zones = Intl.supportedValuesOf('timeZone').slice(0, 25);
  const config = createDefaultConfig('Asia/Baghdad');
  config.locations = zones.map((timezone, index) => ({
    id: `id-${index}`,
    timezone,
    city: `City ${index}`,
    country: 'Test',
    label: '',
    clockStyle: 'combined',
    order: index,
  }));

  assert.throws(() => validateConfigForWrite(config), /24/);
});

test('normalization migrates incomplete values and keeps only known settings', () => {
  const { config, issues, migrated } = normalizeConfig({
    onboardingComplete: 'yes',
    settings: {
      timeFormat: 'invalid',
      defaultClockStyle: 'digital',
      showSeconds: true,
      density: 'compact',
      reducedMotion: true,
      extra: 42,
    },
    locations: [],
  }, 'Asia/Baghdad');

  assert.equal(migrated, true);
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.onboardingComplete, false);
  assert.deepEqual(config.settings, {
    timeFormat: '24h',
    defaultClockStyle: 'digital',
    showSeconds: true,
    density: 'compact',
    reducedMotion: true,
  });
  assert.equal(config.locations.length, 1);
  assert.ok(issues.some((issue) => issue.code === 'missing-locations'));
});

test('write validation rejects duplicate canonical timezones', () => {
  const config = createDefaultConfig('Asia/Baghdad');
  config.locations.push({
    ...config.locations[0],
    id: 'duplicate',
    order: 1,
  });
  assert.throws(() => validateConfigForWrite(config), /duplicate/i);
});

test('normalization repairs duplicate location ids without losing valid timezones', () => {
  const { config, issues } = normalizeConfig({
    schemaVersion: 1,
    onboardingComplete: true,
    settings: {},
    locations: [
      { id: 'same-id', timezone: 'Asia/Baghdad', city: 'Baghdad', order: 0 },
      { id: 'same-id', timezone: 'Europe/London', city: 'London', order: 1 },
    ],
  }, 'Asia/Baghdad');

  assert.equal(config.locations.length, 2);
  assert.notEqual(config.locations[0].id, config.locations[1].id);
  assert.ok(issues.some((item) => item.code === 'duplicate-id'));
});

test('write validation rejects duplicate location ids', () => {
  const config = createDefaultConfig('Asia/Baghdad');
  config.locations.push({
    ...config.locations[0],
    timezone: 'Europe/London',
    city: 'London',
    order: 1,
  });
  assert.throws(() => validateConfigForWrite(config), /identifier/i);
});
