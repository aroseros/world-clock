import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatClock,
  getAnalogAngles,
  getOffsetMinutes,
  getZonedParts,
  millisecondsUntilBoundary,
  startAlignedClock,
} from '../shared/clock-engine.js';

const instant = new Date('2026-07-27T06:15:30.000Z');

test('formats Baghdad in 24-hour mode with a positive offset', () => {
  const snapshot = formatClock(instant, 'Asia/Baghdad', {
    timeFormat: '24h',
    showSeconds: true,
  });
  assert.equal(snapshot.time, '09:15:30');
  assert.equal(snapshot.date, 'Mon, 27 Jul 2026');
  assert.equal(snapshot.offset, 'UTC+03:00');
  assert.equal(snapshot.dayState, 'day');
  assert.match(snapshot.ariaLabel, /Baghdad time, 09:15:30/i);
});

test('supports half-hour and quarter-hour offsets', () => {
  assert.equal(getOffsetMinutes(instant, 'Asia/Kolkata'), 330);
  assert.equal(getOffsetMinutes(instant, 'Asia/Kathmandu'), 345);
});

test('returns numeric zoned calendar parts', () => {
  assert.deepEqual(getZonedParts(instant, 'Europe/London'), {
    year: 2026,
    month: 7,
    day: 27,
    hour: 7,
    minute: 15,
    second: 30,
    weekday: 'Mon',
  });
});

test('calculates continuous analog hand angles', () => {
  assert.deepEqual(getAnalogAngles({ hour: 3, minute: 15, second: 30 }), {
    hour: 97.75,
    minute: 93,
    second: 180,
  });
});

test('aligns timer delay to the next real boundary', () => {
  assert.equal(millisecondsUntilBoundary(12_345, true), 655);
  assert.equal(millisecondsUntilBoundary(12_345, false), 47_655);
  assert.equal(millisecondsUntilBoundary(60_000, false), 60_000);
});

test('starts immediately and schedules one recursively aligned timer', () => {
  const callbacks = [];
  const timers = [];
  const cleared = [];
  let nowMs = 12_345;
  const stop = startAlignedClock((date) => callbacks.push(date.getTime()), {
    showSeconds: true,
    now: () => nowMs,
    setTimer(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimer(id) { cleared.push(id); },
  });

  assert.deepEqual(callbacks, [12_345]);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 655);
  nowMs = 13_000;
  timers[0].fn();
  assert.deepEqual(callbacks, [12_345, 13_000]);
  assert.equal(timers.length, 2);
  stop();
  assert.deepEqual(cleared, [2]);
});

test('test seam tracks one active timer and decrements on stop', () => {
  const previous = globalThis.__WORLD_CLOCK_TEST__;
  globalThis.__WORLD_CLOCK_TEST__ = {};
  const timers = [];
  const stop = startAlignedClock(() => {}, {
    now: () => Date.UTC(2026, 6, 27, 9, 0, 0),
    setTimer(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimer() {},
  });
  assert.equal(globalThis.__WORLD_CLOCK_TEST__.timersStarted, 1);
  assert.equal(globalThis.__WORLD_CLOCK_TEST__.activeTimers, 1);
  assert.equal(globalThis.__WORLD_CLOCK_TEST__.maxActiveTimers, 1);
  stop();
  stop();
  assert.equal(globalThis.__WORLD_CLOCK_TEST__.activeTimers, 0);
  globalThis.__WORLD_CLOCK_TEST__ = previous;
});
