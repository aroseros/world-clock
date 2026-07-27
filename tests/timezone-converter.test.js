import assert from 'node:assert/strict';
import test from 'node:test';
import { convertWallTime, parseWallInput, resolveWallTime } from '../shared/timezone-converter.js';

test('converts an ordinary Baghdad wall time to London', () => {
  const result = convertWallTime({
    date: '2026-07-27',
    time: '09:00',
    sourceTimeZone: 'Asia/Baghdad',
    destinationTimeZone: 'Europe/London',
  });
  assert.equal(result.source.status, 'exact');
  assert.equal(result.destination.time24, '07:00');
  assert.equal(result.dayDifference, 0);
  assert.equal(result.destination.offset, 'UTC+01:00');
});

test('explains the New York spring-forward gap', () => {
  const resolution = resolveWallTime({
    date: '2024-03-10',
    time: '02:30',
    timeZone: 'America/New_York',
  });
  assert.equal(resolution.status, 'nonexistent');
  assert.equal(resolution.adjustedByMinutes, 60);
  assert.equal(resolution.adjustedWallTime, '03:30');
  assert.equal(resolution.instant.toISOString(), '2024-03-10T07:30:00.000Z');
});

test('returns both occurrences during the New York autumn repeat', () => {
  const earlier = resolveWallTime({
    date: '2024-11-03',
    time: '01:30',
    timeZone: 'America/New_York',
    occurrence: 'earlier',
  });
  const later = resolveWallTime({
    date: '2024-11-03',
    time: '01:30',
    timeZone: 'America/New_York',
    occurrence: 'later',
  });
  assert.equal(earlier.status, 'ambiguous');
  assert.equal(later.status, 'ambiguous');
  assert.equal(later.instant.getTime() - earlier.instant.getTime(), 3_600_000);
  assert.deepEqual(earlier.alternatives.map((value) => value.toISOString()), [
    '2024-11-03T05:30:00.000Z',
    '2024-11-03T06:30:00.000Z',
  ]);
});

test('reports destination calendar-day differences', () => {
  const result = convertWallTime({
    date: '2026-07-27',
    time: '23:30',
    sourceTimeZone: 'America/Los_Angeles',
    destinationTimeZone: 'Asia/Tokyo',
  });
  assert.equal(result.destination.date, '2026-07-28');
  assert.equal(result.dayDifference, 1);
});

test('strictly validates wall date and time fields', () => {
  assert.deepEqual(parseWallInput('2024-02-29', '23:59'), {
    year: 2024, month: 2, day: 29, hour: 23, minute: 59, second: 0,
  });
  assert.throws(() => parseWallInput('2024-02-30', '12:00'), /valid calendar range/);
  assert.throws(() => parseWallInput('2024-02-29', '24:00'), /valid calendar range/);
  assert.throws(() => parseWallInput('29-02-2024', '12:00'), /YYYY-MM-DD/);
});
