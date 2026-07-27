import { getOffsetMinutes, getZonedParts } from './clock-engine.js';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function wallEpoch(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
}

function sameWall(left, right) {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && (left.second || 0) === (right.second || 0);
}

function wallTimeText(parts) {
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function dateText(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function offsetText(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

export function parseWallInput(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new TypeError('Date and time must use YYYY-MM-DD and HH:mm.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
    || check.getUTCHours() !== hour
    || check.getUTCMinutes() !== minute
  ) {
    throw new TypeError('Date or time is outside the valid calendar range.');
  }
  return { year, month, day, hour, minute, second: 0 };
}

function collectCandidateOffsets(naiveEpoch, timeZone) {
  const offsets = new Set();
  const step = 30 * 60_000;
  const span = 36 * 60 * 60_000;
  for (let delta = -span; delta <= span; delta += step) {
    offsets.add(getOffsetMinutes(new Date(naiveEpoch + delta), timeZone));
  }
  return [...offsets];
}

export function resolveWallTime({ date, time, timeZone, occurrence = 'earlier' }) {
  if (!['earlier', 'later'].includes(occurrence)) {
    throw new TypeError('Occurrence must be earlier or later.');
  }
  const requested = parseWallInput(date, time);
  const naiveEpoch = wallEpoch(requested);
  const offsets = collectCandidateOffsets(naiveEpoch, timeZone);
  const candidates = offsets
    .map((offset) => new Date(naiveEpoch - offset * 60_000))
    .sort((a, b) => a.getTime() - b.getTime());

  const matches = candidates.filter((candidate) => sameWall(getZonedParts(candidate, timeZone), requested));
  const uniqueMatches = matches.filter((candidate, index, all) => (
    all.findIndex((other) => other.getTime() === candidate.getTime()) === index
  ));

  if (uniqueMatches.length === 1) {
    return {
      status: 'exact',
      instant: uniqueMatches[0],
      alternatives: [uniqueMatches[0]],
      occurrence: 'earlier',
      adjustedByMinutes: 0,
      adjustedWallTime: wallTimeText(requested),
    };
  }

  if (uniqueMatches.length > 1) {
    const selected = occurrence === 'later' ? uniqueMatches.at(-1) : uniqueMatches[0];
    return {
      status: 'ambiguous',
      instant: selected,
      alternatives: uniqueMatches,
      occurrence,
      adjustedByMinutes: 0,
      adjustedWallTime: wallTimeText(requested),
    };
  }

  const forwardCandidates = candidates
    .map((candidate) => {
      const local = getZonedParts(candidate, timeZone);
      return {
        candidate,
        local,
        difference: Math.round((wallEpoch(local) - naiveEpoch) / 60_000),
      };
    })
    .filter(({ difference }) => difference > 0)
    .sort((a, b) => a.difference - b.difference || a.candidate.getTime() - b.candidate.getTime());

  if (forwardCandidates.length === 0) {
    throw new RangeError('The local time could not be resolved in this timezone.');
  }

  const adjusted = forwardCandidates[0];
  return {
    status: 'nonexistent',
    instant: adjusted.candidate,
    alternatives: [adjusted.candidate],
    occurrence: 'earlier',
    adjustedByMinutes: adjusted.difference,
    adjustedWallTime: wallTimeText(adjusted.local),
  };
}

export function convertWallTime({
  date,
  time,
  sourceTimeZone,
  destinationTimeZone,
  occurrence = 'earlier',
}) {
  const source = resolveWallTime({
    date,
    time,
    timeZone: sourceTimeZone,
    occurrence,
  });
  const sourceParts = getZonedParts(source.instant, sourceTimeZone);
  const destinationParts = getZonedParts(source.instant, destinationTimeZone);
  const sourceDateEpoch = Date.UTC(sourceParts.year, sourceParts.month - 1, sourceParts.day);
  const destinationDateEpoch = Date.UTC(
    destinationParts.year,
    destinationParts.month - 1,
    destinationParts.day,
  );
  const dayDifference = Math.round((destinationDateEpoch - sourceDateEpoch) / 86_400_000);

  let message = '';
  if (source.status === 'nonexistent') {
    message = `This local time does not occur; it was adjusted forward by ${source.adjustedByMinutes} minutes.`;
  } else if (source.status === 'ambiguous') {
    message = `This local time occurs twice; using the ${source.occurrence === 'later' ? 'second' : 'first'} occurrence.`;
  }

  return {
    source,
    destination: {
      date: dateText(destinationParts),
      time24: wallTimeText(destinationParts),
      weekday: destinationParts.weekday,
      offset: offsetText(getOffsetMinutes(source.instant, destinationTimeZone)),
    },
    dayDifference,
    message,
  };
}
