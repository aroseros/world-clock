const partsFormatterCache = new Map();

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_LONG = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getPartsFormatter(timeZone) {
  if (!partsFormatterCache.has(timeZone)) {
    partsFormatterCache.set(timeZone, new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }));
  }
  return partsFormatterCache.get(timeZone);
}

export function getZonedParts(instant, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new TypeError('A valid instant is required.');
  const values = Object.fromEntries(
    getPartsFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: values.weekday,
  };
}

export function getOffsetMinutes(instant, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const instantWithoutMs = Math.floor(date.getTime() / 1_000) * 1_000;
  return Math.round((asUtc - instantWithoutMs) / 60_000);
}

export function getAnalogAngles({ hour, minute, second }) {
  return {
    hour: ((hour % 12) + minute / 60 + second / 3600) * 30,
    minute: (minute + second / 60) * 6,
    second: second * 6,
  };
}

function formatOffset(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

function offsetAria(minutes) {
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? 'plus' : 'minus';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  const values = [];
  if (hours) values.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (mins) values.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  return `UTC ${sign} ${values.join(' and ')}`;
}

function formatTime(parts, { timeFormat = '24h', showSeconds = false } = {}) {
  const minuteSecond = `${pad2(parts.minute)}${showSeconds ? `:${pad2(parts.second)}` : ''}`;
  if (timeFormat === '12h') {
    const hour = parts.hour % 12 || 12;
    return `${pad2(hour)}:${minuteSecond} ${parts.hour < 12 ? 'AM' : 'PM'}`;
  }
  return `${pad2(parts.hour)}:${minuteSecond}`;
}

export function formatClock(instant, timeZone, settings = {}) {
  const parts = getZonedParts(instant, timeZone);
  const offsetMinutes = getOffsetMinutes(instant, timeZone);
  const time = formatTime(parts, settings);
  const date = `${parts.weekday}, ${pad2(parts.day)} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
  const city = timeZone.split('/').at(-1).replaceAll('_', ' ');
  const longDate = `${WEEKDAYS_LONG[parts.weekday]} ${parts.day} ${MONTHS_LONG[parts.month - 1]} ${parts.year}`;
  return {
    time,
    date,
    offset: formatOffset(offsetMinutes),
    dayState: parts.hour >= 6 && parts.hour < 18 ? 'day' : 'night',
    angles: getAnalogAngles(parts),
    ariaLabel: `${city} time, ${time}, ${longDate}, ${offsetAria(offsetMinutes)}`,
  };
}

export function millisecondsUntilBoundary(nowMs, showSeconds) {
  const unit = showSeconds ? 1_000 : 60_000;
  const remainder = nowMs % unit;
  return remainder === 0 ? unit : unit - remainder;
}

export function startAlignedClock(callback, {
  showSeconds = false,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof callback !== 'function') throw new TypeError('A clock callback is required.');
  let timerId;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const current = now();
    callback(new Date(current));
    timerId = setTimer(tick, millisecondsUntilBoundary(current, showSeconds));
  };

  const testState = globalThis.__WORLD_CLOCK_TEST__;
  if (testState) {
    testState.timersStarted = (testState.timersStarted || 0) + 1;
    testState.activeTimers = (testState.activeTimers || 0) + 1;
    testState.maxActiveTimers = Math.max(testState.maxActiveTimers || 0, testState.activeTimers);
  }
  tick();
  return () => {
    if (stopped) return;
    stopped = true;
    if (timerId !== undefined) clearTimer(timerId);
    if (testState) testState.activeTimers = Math.max(0, (testState.activeTimers || 1) - 1);
  };
}
