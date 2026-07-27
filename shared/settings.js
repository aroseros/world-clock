export const SCHEMA_VERSION = 1;
export const MAX_LOCATIONS = 24;
export const CLOCK_STYLES = new Set(['analog', 'digital', 'combined']);
export const TIME_FORMATS = new Set(['12h', '24h']);
export const DENSITIES = new Set(['compact', 'comfortable']);

export const DEFAULT_SETTINGS = Object.freeze({
  timeFormat: '24h',
  defaultClockStyle: 'combined',
  showSeconds: false,
  density: 'comfortable',
  reducedMotion: false,
});

function issue(code, path, message) {
  return { code, path, message };
}

export function canonicalizeTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timeZone.trim() })
      .resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isValidTimeZone(timeZone) {
  return canonicalizeTimeZone(timeZone) !== null;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `location-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createLocation(input, order = 0) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Location input must be an object.');
  }
  const timezone = canonicalizeTimeZone(input.timezone);
  if (!timezone) throw new TypeError(`Invalid timezone: ${input.timezone}`);
  const fallbackCity = timezone.split('/').at(-1).replaceAll('_', ' ');
  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : createId(),
    timezone,
    city: String(input.city || fallbackCity).trim() || fallbackCity,
    country: String(input.country || '').trim(),
    label: String(input.label || '').trim(),
    clockStyle: CLOCK_STYLES.has(input.clockStyle) ? input.clockStyle : 'combined',
    order: Number.isInteger(order) && order >= 0 ? order : 0,
  };
}

export function createDefaultConfig(localTimezone, metadata = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboardingComplete: false,
    settings: { ...DEFAULT_SETTINGS },
    locations: [createLocation({ timezone: localTimezone, ...metadata }, 0)],
  };
}

function normalizeSettings(input, issues) {
  const value = input && typeof input === 'object' ? input : {};
  const settings = { ...DEFAULT_SETTINGS };

  if (TIME_FORMATS.has(value.timeFormat)) settings.timeFormat = value.timeFormat;
  else if (value.timeFormat !== undefined) {
    issues.push(issue('invalid-setting', 'settings.timeFormat', 'Unsupported time format; using 24h.'));
  }

  if (CLOCK_STYLES.has(value.defaultClockStyle)) {
    settings.defaultClockStyle = value.defaultClockStyle;
  } else if (value.defaultClockStyle !== undefined) {
    issues.push(issue('invalid-setting', 'settings.defaultClockStyle', 'Unsupported clock style; using combined.'));
  }

  if (typeof value.showSeconds === 'boolean') settings.showSeconds = value.showSeconds;
  else if (value.showSeconds !== undefined) {
    issues.push(issue('invalid-setting', 'settings.showSeconds', 'Seconds preference must be boolean.'));
  }

  if (DENSITIES.has(value.density)) settings.density = value.density;
  else if (value.density !== undefined) {
    issues.push(issue('invalid-setting', 'settings.density', 'Unsupported density; using comfortable.'));
  }

  if (typeof value.reducedMotion === 'boolean') settings.reducedMotion = value.reducedMotion;
  else if (value.reducedMotion !== undefined) {
    issues.push(issue('invalid-setting', 'settings.reducedMotion', 'Reduced motion preference must be boolean.'));
  }

  return settings;
}

function normalizeLocations(input, issues) {
  if (!Array.isArray(input)) return [];
  const candidates = [...input].sort((a, b) => {
    const ao = Number.isFinite(a?.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b?.order) ? b.order : Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });
  const seen = new Set();
  const seenIds = new Set();
  const locations = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const raw = candidates[index];
    const timezone = canonicalizeTimeZone(raw?.timezone);
    if (!timezone) {
      issues.push(issue('invalid-timezone', `locations[${index}].timezone`, `Invalid timezone: ${raw?.timezone ?? ''}`));
      continue;
    }
    if (seen.has(timezone)) {
      issues.push(issue('duplicate-timezone', `locations[${index}].timezone`, `Duplicate timezone: ${timezone}`));
      continue;
    }
    seen.add(timezone);
    const rawId = typeof raw?.id === 'string' ? raw.id.trim() : '';
    const duplicateId = rawId && seenIds.has(rawId);
    if (duplicateId) {
      issues.push(issue('duplicate-id', `locations[${index}].id`, 'Duplicate location identifier was replaced.'));
    }
    let location = createLocation({ ...raw, id: duplicateId ? undefined : rawId, timezone }, locations.length);
    while (seenIds.has(location.id)) {
      location = createLocation({ ...location, id: undefined }, locations.length);
    }
    seenIds.add(location.id);
    locations.push(location);
  }
  return locations;
}

export function normalizeConfig(input, localTimezone) {
  const issues = [];
  const source = input && typeof input === 'object' ? input : {};
  const migrated = source.schemaVersion !== SCHEMA_VERSION;
  if (migrated) {
    issues.push(issue('schema-migrated', 'schemaVersion', `Configuration migrated to schema ${SCHEMA_VERSION}.`));
  }

  let locations = normalizeLocations(source.locations, issues);
  if (locations.length === 0) {
    const fallback = createDefaultConfig(localTimezone);
    locations = fallback.locations;
    issues.push(issue('missing-locations', 'locations', 'No valid locations remained; restored the local timezone.'));
  }

  if (locations.length > MAX_LOCATIONS) {
    issues.push(issue('too-many-locations', 'locations', `Only the first ${MAX_LOCATIONS} locations were kept.`));
    locations = locations.slice(0, MAX_LOCATIONS).map((location, order) => ({ ...location, order }));
  }

  return {
    config: {
      schemaVersion: SCHEMA_VERSION,
      onboardingComplete: source.onboardingComplete === true,
      settings: normalizeSettings(source.settings, issues),
      locations,
    },
    issues,
    migrated,
  };
}

export function validateConfigForWrite(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Configuration must be an object.');
  }
  if (!Array.isArray(input.locations)) {
    throw new TypeError('Configuration locations must be an array.');
  }
  if (input.locations.length > MAX_LOCATIONS) {
    throw new TypeError(`A maximum of ${MAX_LOCATIONS} locations is supported.`);
  }

  const localTimezone = canonicalizeTimeZone(input.locations[0]?.timezone)
    || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { config, issues } = normalizeConfig(input, localTimezone);

  const invalidLocation = issues.find(({ code }) => code === 'invalid-timezone');
  if (invalidLocation) throw new TypeError(invalidLocation.message);
  const duplicate = issues.find(({ code }) => code === 'duplicate-timezone');
  if (duplicate) throw new TypeError(duplicate.message);
  const duplicateId = issues.find(({ code }) => code === 'duplicate-id');
  if (duplicateId) throw new TypeError('Duplicate location identifier cannot be saved.');
  if (config.locations.length !== input.locations.length) {
    throw new TypeError('Configuration contains locations that cannot be saved safely.');
  }
  return config;
}
