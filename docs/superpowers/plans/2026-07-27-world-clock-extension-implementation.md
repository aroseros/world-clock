# World Clock Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished Manifest V3 Chrome extension with a quick-access popup, a persistent side panel, onboarding, synchronized world clocks, city/timezone search, per-location clock styles, and a daylight-saving-aware time converter.

**Architecture:** The extension uses plain HTML, CSS, and ES modules. Each visible extension page owns one aligned clock timer and reads a versioned configuration through a shared `chrome.storage.sync` adapter. Pure modules handle validation, timezone formatting, wall-time conversion, and search ranking; popup, side panel, and onboarding controllers compose those modules with reusable DOM components.

**Tech Stack:** Chrome Extension Manifest V3, Chrome 116+, modern browser JavaScript modules, `Intl.DateTimeFormat`, `chrome.storage.sync`, `chrome.sidePanel`, Node.js built-in test runner, Playwright for Chromium extension integration tests, and `@vvo/tzdb` as a development-only generator input for the checked-in search dataset.

## Global Constraints

- Target Google Chrome with Manifest V3 and set `minimum_chrome_version` to `116`.
- Use plain HTML, CSS, and modern JavaScript modules; no production framework and no runtime build requirement.
- Declare only `storage` and `sidePanel` permissions.
- Do not add content scripts, host permissions, external APIs, analytics, telemetry, accounts, or runtime network requests.
- Persist user configuration only in `chrome.storage.sync`; do not introduce a separate local-storage fallback.
- Support at most 24 saved locations, identified uniquely by canonical IANA timezone.
- Support `analog`, `digital`, and `combined` clock styles per location.
- Treat 06:00–17:59 local time as day and all other hours as night.
- Use one aligned timer per visible extension page, with seconds disabled by default.
- Keep the popup approximately 380 × 560 CSS pixels and make the side panel responsive from narrow to wide widths.
- Preserve keyboard access, visible focus, reduced-motion support, sufficient contrast, semantic labels, and non-colour status cues.
- Use the browser's timezone rules for conversion; explain ambiguous and nonexistent local times.
- Keep generated timezone metadata inside the extension package and make no runtime request outside `chrome-extension://` resources.

---

## Planned File Map

```text
world-clock-extension/
├── manifest.json                         # MV3 entry points, permissions, icons, minimum Chrome version
├── package.json                          # Test and dataset-generation commands only
├── package-lock.json                     # Reproducible development dependencies
├── playwright.config.js                  # Extension integration-test configuration
├── README.md                             # Local installation, tests, and acceptance instructions
├── background/
│   └── service-worker.js                 # First-install onboarding only
├── popup/
│   ├── popup.html                        # Compact popup shell
│   ├── popup.css                         # Popup-only dimensions/layout
│   └── popup.js                          # Popup controller and side-panel user gesture
├── sidepanel/
│   ├── sidepanel.html                    # Persistent workspace shell
│   ├── sidepanel.css                     # Responsive side-panel layout
│   └── sidepanel.js                      # Management, reordering, converter, settings
├── onboarding/
│   ├── onboarding.html                   # First-run multi-step form
│   ├── onboarding.css                    # Onboarding layout
│   └── onboarding.js                     # Local-zone detection and initial save
├── shared/
│   ├── clock-engine.js                   # Zoned formatting, offsets, analog angles, aligned timer
│   ├── timezone-converter.js             # Wall-time resolution and destination conversion
│   ├── settings.js                       # Schema constants, defaults, validation, migrations
│   ├── storage.js                        # `chrome.storage.sync` adapter and subscription/debounce
│   ├── search.js                         # Dataset loading, normalization, ranking, duplicate filtering
│   ├── components.js                     # Stateless reusable DOM renderers and UI helpers
│   └── shared.css                        # Tokens, glass surfaces, controls, focus, reduced motion
├── data/
│   ├── timezone-aliases.json             # Curated common aliases not supplied by tzdb metadata
│   └── timezones.json                    # Generated and committed runtime search dataset
├── scripts/
│   └── build-timezones.mjs               # Development-only dataset generator
├── assets/
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
└── tests/
    ├── helpers/
    │   ├── fake-storage.js               # In-memory Chrome storage test double
    │   └── extension-fixture.js           # Playwright persistent Chromium context fixture
    ├── settings.test.js
    ├── storage.test.js
    ├── clock-engine.test.js
    ├── timezone-converter.test.js
    ├── search.test.js
    └── integration/
        └── extension.spec.js
```

---

### Task 1: Scaffold the Loadable Manifest V3 Extension

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `background/service-worker.js`
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Create: `popup/popup.js`
- Create: `sidepanel/sidepanel.html`
- Create: `sidepanel/sidepanel.css`
- Create: `sidepanel/sidepanel.js`
- Create: `onboarding/onboarding.html`
- Create: `onboarding/onboarding.css`
- Create: `onboarding/onboarding.js`
- Create: `shared/shared.css`
- Create: `assets/icons/icon16.png`
- Create: `assets/icons/icon32.png`
- Create: `assets/icons/icon48.png`
- Create: `assets/icons/icon128.png`
- Create: `tests/manifest.test.js`

**Interfaces:**
- Consumes: Approved specification only.
- Produces: Valid extension entry points at `popup/popup.html`, `sidepanel/sidepanel.html`, and `onboarding/onboarding.html`; module service worker at `background/service-worker.js`.

- [ ] **Step 1: Add the package metadata and test command**

```json
{
  "name": "world-clock-extension",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:unit": "node --test tests/*.test.js",
    "test:integration": "playwright test",
    "test:all": "npm run test:unit && npm run test:integration",
    "data:build": "node scripts/build-timezones.mjs"
  }
}
```

- [ ] **Step 2: Write the failing manifest contract test**

```js
// tests/manifest.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('../manifest.json', import.meta.url), 'utf8'),
);

test('manifest exposes only the approved MV3 capabilities', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '116');
  assert.deepEqual([...manifest.permissions].sort(), ['sidePanel', 'storage']);
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.equal(manifest.side_panel.default_path, 'sidepanel/sidepanel.html');
  assert.deepEqual(manifest.background, {
    service_worker: 'background/service-worker.js',
    type: 'module',
  });
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL because `manifest.json` does not exist.

- [ ] **Step 4: Create the manifest**

```json
{
  "manifest_version": 3,
  "name": "World Clock",
  "description": "View synchronized world clocks and convert time across timezones.",
  "version": "1.0.0",
  "minimum_chrome_version": "116",
  "permissions": ["storage", "sidePanel"],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_title": "Open World Clock",
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "assets/icons/icon16.png",
      "32": "assets/icons/icon32.png"
    }
  },
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "icons": {
    "16": "assets/icons/icon16.png",
    "32": "assets/icons/icon32.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

- [ ] **Step 5: Create minimal module entry points that load without errors**

```js
// background/service-worker.js
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
});
```

```html
<!-- popup/popup.html; use the same document skeleton for sidepanel and onboarding with their own CSS/JS paths -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>World Clock</title>
    <link rel="stylesheet" href="../shared/shared.css" />
    <link rel="stylesheet" href="./popup.css" />
  </head>
  <body>
    <main id="app" aria-busy="true"></main>
    <script type="module" src="./popup.js"></script>
  </body>
</html>
```

```js
// popup/popup.js, sidepanel/sidepanel.js, onboarding/onboarding.js
const app = document.querySelector('#app');
app.textContent = 'World Clock';
app.setAttribute('aria-busy', 'false');
```

- [ ] **Step 6: Export the approved clock mark as transparent square PNGs**

Create raster files at exactly 16×16, 32×32, 48×48, and 128×128 pixels. Use the same mark at every size, preserve transparency, and verify dimensions:

```bash
file assets/icons/icon16.png assets/icons/icon32.png assets/icons/icon48.png assets/icons/icon128.png
```

Expected: each file reports PNG image data with its matching square dimensions.

- [ ] **Step 7: Run the manifest test**

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Load the unpacked extension manually**

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the repository root. Verify the toolbar popup, side panel entry, and onboarding page load without console errors.

- [ ] **Step 9: Commit the scaffold**

```bash
git add manifest.json package.json background popup sidepanel onboarding shared assets tests/manifest.test.js
git commit -m "feat: scaffold world clock extension"
```

---

### Task 2: Define and Validate the Versioned Configuration Model

**Files:**
- Create: `shared/settings.js`
- Create: `tests/settings.test.js`

**Interfaces:**
- Consumes: None.
- Produces:
  - `SCHEMA_VERSION: 1`
  - `MAX_LOCATIONS: 24`
  - `DEFAULT_SETTINGS: Readonly<Settings>`
  - `createLocation(input, order): Location`
  - `createDefaultConfig(localTimezone, metadata?): Config`
  - `normalizeConfig(input, localTimezone): { config: Config, issues: ValidationIssue[], migrated: boolean }`
  - `validateConfigForWrite(input): Config`, throwing `TypeError` for invalid writes.

- [ ] **Step 1: Write failing tests for defaults, invalid records, unknown fields, and duplicate zones**

```js
// tests/settings.test.js
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
  const config = createDefaultConfig('Asia/Baghdad');
  config.locations = Array.from({ length: 25 }, (_, index) => ({
    id: `id-${index}`,
    timezone: `Etc/GMT${index === 0 ? '' : `+${index}`}`,
    city: `City ${index}`,
    country: 'Test',
    label: '',
    clockStyle: 'combined',
    order: index,
  }));

  assert.throws(() => validateConfigForWrite(config), /24/);
});
```

- [ ] **Step 2: Run the settings tests to verify failure**

Run: `node --test tests/settings.test.js`

Expected: FAIL because `shared/settings.js` does not exist.

- [ ] **Step 3: Implement constants, timezone validation, stable IDs, and normalization**

```js
// shared/settings.js
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

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function createLocation(input, order = 0) {
  const timezone = input.timezone;
  if (!isValidTimeZone(timezone)) throw new TypeError(`Invalid timezone: ${timezone}`);
  return {
    id: input.id || crypto.randomUUID(),
    timezone,
    city: String(input.city || timezone.split('/').at(-1)).replaceAll('_', ' '),
    country: String(input.country || ''),
    label: String(input.label || ''),
    clockStyle: CLOCK_STYLES.has(input.clockStyle) ? input.clockStyle : 'combined',
    order,
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
```

Complete `normalizeConfig()` by merging only known settings, validating booleans/enums, removing invalid or duplicate timezone records, sorting by `order`, reindexing sequentially, migrating missing/older schema data to version 1, and returning issue objects shaped as `{ code, path, message }`. Implement `validateConfigForWrite()` by calling normalization and throwing when the normalized value would lose a location, contains duplicates, or exceeds `MAX_LOCATIONS`.

- [ ] **Step 4: Run the tests and correct invalid `Etc/GMT` fixture generation if the environment rejects a fixture zone**

Run: `node --test tests/settings.test.js`

Expected: PASS. Keep the 24-location limit assertion; use a fixture list from `Intl.supportedValuesOf('timeZone').slice(0, 25)` if necessary.

- [ ] **Step 5: Commit the configuration model**

```bash
git add shared/settings.js tests/settings.test.js
git commit -m "feat: validate world clock configuration"
```

---

### Task 3: Build the Chrome Sync Storage Adapter

**Files:**
- Create: `shared/storage.js`
- Create: `tests/helpers/fake-storage.js`
- Create: `tests/storage.test.js`

**Interfaces:**
- Consumes:
  - `normalizeConfig(input, localTimezone)` from `shared/settings.js`
  - `validateConfigForWrite(input)` from `shared/settings.js`
- Produces:
  - `STORAGE_KEY: 'worldClockConfig'`
  - `readConfig(options?): Promise<{ config, issues }>`
  - `writeConfig(config, options?): Promise<void>`
  - `subscribeConfig(listener, options?): () => void`
  - `createDebouncedWriter(writeFn, delayMs?): { schedule, flush, cancel }`
  - `classifyStorageError(error): { code, message }`

- [ ] **Step 1: Create an in-memory Chrome storage test double**

```js
// tests/helpers/fake-storage.js
export function createFakeChromeStorage(initial = {}) {
  const data = structuredClone(initial);
  const listeners = new Set();

  const sync = {
    async get(key) {
      return { [key]: structuredClone(data[key]) };
    },
    async set(items) {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
        data[key] = structuredClone(value);
      }
      for (const listener of listeners) listener(changes, 'sync');
    },
  };

  return {
    sync,
    onChanged: {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
    },
    snapshot() { return structuredClone(data); },
  };
}
```

- [ ] **Step 2: Write failing storage tests**

```js
// tests/storage.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultConfig } from '../shared/settings.js';
import {
  createDebouncedWriter,
  readConfig,
  subscribeConfig,
  writeConfig,
} from '../shared/storage.js';
import { createFakeChromeStorage } from './helpers/fake-storage.js';

test('reads, validates, writes, and publishes sync configuration', async () => {
  const storageApi = createFakeChromeStorage();
  const initial = createDefaultConfig('Asia/Baghdad');
  await writeConfig(initial, { storageArea: storageApi.sync });

  const received = [];
  const unsubscribe = subscribeConfig((value) => received.push(value), {
    storageApi,
    localTimezone: 'Asia/Baghdad',
  });

  const changed = structuredClone(initial);
  changed.onboardingComplete = true;
  await writeConfig(changed, { storageArea: storageApi.sync });

  const read = await readConfig({
    storageArea: storageApi.sync,
    localTimezone: 'Asia/Baghdad',
  });

  assert.equal(read.config.onboardingComplete, true);
  assert.equal(received.at(-1).config.onboardingComplete, true);
  unsubscribe();
});

test('debounced writer persists only the latest rapid update', async () => {
  const writes = [];
  const writer = createDebouncedWriter(async (value) => writes.push(value), 5);
  writer.schedule({ order: 1 });
  writer.schedule({ order: 2 });
  await writer.flush();
  assert.deepEqual(writes, [{ order: 2 }]);
});
```

- [ ] **Step 3: Run the tests to verify failure**

Run: `node --test tests/storage.test.js`

Expected: FAIL because `shared/storage.js` does not exist.

- [ ] **Step 4: Implement the adapter and explicit error classification**

```js
// shared/storage.js
import {
  createDefaultConfig,
  normalizeConfig,
  validateConfigForWrite,
} from './settings.js';

export const STORAGE_KEY = 'worldClockConfig';

export async function readConfig({
  storageArea = chrome.storage.sync,
  localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
} = {}) {
  try {
    const stored = await storageArea.get(STORAGE_KEY);
    if (!stored[STORAGE_KEY]) {
      return { config: createDefaultConfig(localTimezone), issues: [] };
    }
    const { config, issues } = normalizeConfig(stored[STORAGE_KEY], localTimezone);
    return { config, issues };
  } catch (error) {
    throw Object.assign(new Error(classifyStorageError(error).message), {
      cause: error,
      storageCode: classifyStorageError(error).code,
    });
  }
}

export async function writeConfig(config, { storageArea = chrome.storage.sync } = {}) {
  const validated = validateConfigForWrite(config);
  try {
    await storageArea.set({ [STORAGE_KEY]: validated });
  } catch (error) {
    const classified = classifyStorageError(error);
    throw Object.assign(new Error(classified.message), {
      cause: error,
      storageCode: classified.code,
    });
  }
}

export function classifyStorageError(error) {
  const text = String(error?.message || error || 'Unknown storage error');
  if (/quota|max write|bytes/i.test(text)) {
    return { code: 'quota', message: 'Chrome Sync storage quota was exceeded.' };
  }
  return { code: 'storage', message: 'World Clock could not save to Chrome Sync.' };
}
```

Implement `subscribeConfig()` so it ignores non-`sync` events and unrelated keys, normalizes `newValue`, and returns a listener-removal function. Implement `createDebouncedWriter()` with one pending value, one timer, a `flush()` promise that writes the latest value immediately, and `cancel()` that clears pending work.

- [ ] **Step 5: Run storage tests**

Run: `node --test tests/storage.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the storage adapter**

```bash
git add shared/storage.js tests/helpers/fake-storage.js tests/storage.test.js
git commit -m "feat: add chrome sync storage adapter"
```

---

### Task 4: Implement the Shared Clock Engine and Aligned Page Timer

**Files:**
- Create: `shared/clock-engine.js`
- Create: `tests/clock-engine.test.js`

**Interfaces:**
- Consumes: Browser `Intl.DateTimeFormat` only.
- Produces:
  - `getZonedParts(instant, timeZone): ZonedParts`
  - `getOffsetMinutes(instant, timeZone): number`
  - `getAnalogAngles(parts): { hour, minute, second }`
  - `formatClock(instant, timeZone, settings): ClockSnapshot`
  - `millisecondsUntilBoundary(nowMs, showSeconds): number`
  - `startAlignedClock(callback, options?): () => void`

- [ ] **Step 1: Write failing deterministic clock tests**

```js
// tests/clock-engine.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatClock,
  getAnalogAngles,
  getOffsetMinutes,
  millisecondsUntilBoundary,
} from '../shared/clock-engine.js';

const instant = new Date('2026-07-27T06:15:30.000Z');

test('formats Baghdad in 24-hour mode with a positive offset', () => {
  const snapshot = formatClock(instant, 'Asia/Baghdad', {
    timeFormat: '24h',
    showSeconds: true,
  });
  assert.equal(snapshot.time, '09:15:30');
  assert.match(snapshot.date, /27/);
  assert.equal(snapshot.offset, 'UTC+03:00');
  assert.equal(snapshot.dayState, 'day');
});

test('supports half-hour and quarter-hour offsets', () => {
  assert.equal(getOffsetMinutes(instant, 'Asia/Kolkata'), 330);
  assert.equal(getOffsetMinutes(instant, 'Asia/Kathmandu'), 345);
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
});
```

- [ ] **Step 2: Run the clock tests to verify failure**

Run: `node --test tests/clock-engine.test.js`

Expected: FAIL because `shared/clock-engine.js` does not exist.

- [ ] **Step 3: Implement zoned parts and offset calculation with format-to-parts**

```js
// shared/clock-engine.js
const partsFormatterCache = new Map();

function getPartsFormatter(timeZone) {
  if (!partsFormatterCache.has(timeZone)) {
    partsFormatterCache.set(timeZone, new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23', weekday: 'short',
    }));
  }
  return partsFormatterCache.get(timeZone);
}

export function getZonedParts(instant, timeZone) {
  const values = Object.fromEntries(
    getPartsFormatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
    weekday: values.weekday,
  };
}

export function getOffsetMinutes(instant, timeZone) {
  const p = getZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

export function getAnalogAngles({ hour, minute, second }) {
  return {
    hour: ((hour % 12) + minute / 60 + second / 3600) * 30,
    minute: (minute + second / 60) * 6,
    second: second * 6,
  };
}
```

- [ ] **Step 4: Implement human formatting and day/night state**

`formatClock()` must return:

```js
{
  time: '09:15:30',
  date: 'Mon, 27 Jul 2026',
  offset: 'UTC+03:00',
  dayState: 'day',
  angles: { hour: 277.75, minute: 93, second: 180 },
  ariaLabel: 'Baghdad time, 09:15:30, Monday 27 July 2026, UTC plus 3 hours'
}
```

Use `hour12: settings.timeFormat === '12h'`, include seconds only when enabled, and generate the offset from numeric minutes rather than relying on localized timezone-name strings.

- [ ] **Step 5: Implement the recursively aligned timer**

```js
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
  let timerId;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    callback(new Date(now()));
    timerId = setTimer(tick, millisecondsUntilBoundary(now(), showSeconds));
  };

  tick();
  return () => {
    stopped = true;
    if (timerId !== undefined) clearTimer(timerId);
  };
}
```

- [ ] **Step 6: Run the clock tests**

Run: `node --test tests/clock-engine.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the clock engine**

```bash
git add shared/clock-engine.js tests/clock-engine.test.js
git commit -m "feat: add timezone clock engine"
```

---

### Task 5: Implement DST-Aware Wall-Time Conversion

**Files:**
- Create: `shared/timezone-converter.js`
- Create: `tests/timezone-converter.test.js`

**Interfaces:**
- Consumes:
  - `getZonedParts(instant, timeZone)` from `shared/clock-engine.js`
  - `getOffsetMinutes(instant, timeZone)` from `shared/clock-engine.js`
- Produces:
  - `parseWallInput(date, time): WallParts`
  - `resolveWallTime(input): WallResolution`
  - `convertWallTime(input): ConversionResult`

`WallResolution.status` is one of `exact`, `ambiguous`, or `nonexistent`. Ambiguous inputs expose both valid instants and use `occurrence: 'earlier' | 'later'`. Nonexistent inputs adjust forward to the first valid wall time and report `adjustedByMinutes`.

- [ ] **Step 1: Write failing tests for normal conversion, a spring gap, and an autumn repeat**

```js
// tests/timezone-converter.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { convertWallTime, resolveWallTime } from '../shared/timezone-converter.js';

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
});
```

- [ ] **Step 2: Run the converter tests to verify failure**

Run: `node --test tests/timezone-converter.test.js`

Expected: FAIL because `shared/timezone-converter.js` does not exist.

- [ ] **Step 3: Implement strict input parsing**

```js
export function parseWallInput(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new TypeError('Date and time must use YYYY-MM-DD and HH:mm.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day || check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    throw new TypeError('Date or time is outside the valid calendar range.');
  }
  return { year, month, day, hour, minute, second: 0 };
}
```

- [ ] **Step 4: Implement candidate-offset resolution**

For the requested wall parts:

1. Treat the wall fields as a naive UTC epoch.
2. Sample `getOffsetMinutes()` every 30 minutes across ±36 hours around that epoch and collect unique offsets.
3. For each offset, calculate `candidateEpoch = naiveEpoch - offset * 60_000`.
4. Format the candidate in the source timezone and retain exact wall-field matches.
5. Zero matches means nonexistent, one means exact, and two or more means ambiguous.
6. For nonexistent input, evaluate the formatted local wall values of every candidate and select the smallest positive local-time difference; this advances `02:30` to `03:30` across a one-hour gap.

Return objects with this exact shape:

```js
{
  status: 'ambiguous',
  instant: new Date('2024-11-03T05:30:00.000Z'),
  alternatives: [
    new Date('2024-11-03T05:30:00.000Z'),
    new Date('2024-11-03T06:30:00.000Z')
  ],
  occurrence: 'earlier',
  adjustedByMinutes: 0,
  adjustedWallTime: '01:30'
}
```

- [ ] **Step 5: Implement destination formatting and day difference**

`convertWallTime()` resolves the source, formats the selected instant in the destination timezone, and returns:

```js
{
  source: WallResolution,
  destination: {
    date: '2026-07-27',
    time24: '07:00',
    weekday: 'Mon',
    offset: 'UTC+01:00'
  },
  dayDifference: 0,
  message: ''
}
```

Use `message` to explain an adjustment or ambiguity, for example: `This local time does not occur; it was adjusted forward by 60 minutes.`

- [ ] **Step 6: Run the converter tests**

Run: `node --test tests/timezone-converter.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the converter**

```bash
git add shared/timezone-converter.js tests/timezone-converter.test.js
git commit -m "feat: add daylight saving time converter"
```

---

### Task 6: Generate and Search the Packaged Timezone Dataset

**Files:**
- Modify: `package.json`
- Create: `data/timezone-aliases.json`
- Create: `data/timezones.json`
- Create: `scripts/build-timezones.mjs`
- Create: `shared/search.js`
- Create: `tests/search.test.js`
- Create: `package-lock.json`

**Interfaces:**
- Consumes: Development-only `@vvo/tzdb` metadata.
- Produces:
  - Checked-in dataset records shaped as `{ timezone, city, country, countryCode, aliases, searchText }`.
  - `loadTimezoneDataset(url?): Promise<TimezoneRecord[]>`
  - `normalizeSearchText(value): string`
  - `searchTimezones(records, query, options?): TimezoneRecord[]`
  - `findTimezoneRecord(records, timezone): TimezoneRecord | null`

- [ ] **Step 1: Install the development-only dataset source**

Run:

```bash
npm install --save-dev @vvo/tzdb
```

Expected: `package.json` and `package-lock.json` change; no production dependency is added.

- [ ] **Step 2: Add curated aliases for high-signal searches**

```json
{
  "Asia/Baghdad": ["Erbil", "Arbil", "Sulaymaniyah", "Slemani", "Iraq time"],
  "Asia/Dubai": ["UAE", "Abu Dhabi", "Gulf time"],
  "Europe/London": ["UK", "Britain", "GMT", "British time"],
  "America/New_York": ["NYC", "Eastern time", "ET"],
  "America/Los_Angeles": ["LA", "Pacific time", "PT"],
  "Asia/Tokyo": ["Japan time", "JST"]
}
```

- [ ] **Step 3: Write the dataset generator**

```js
// scripts/build-timezones.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { rawTimeZones } from '@vvo/tzdb';

const aliases = JSON.parse(
  await readFile(new URL('../data/timezone-aliases.json', import.meta.url), 'utf8'),
);

const records = rawTimeZones
  .flatMap((zone) => [...new Set([zone.name, ...(zone.group || [])])].map((timezone) => ({
    timezone,
    city: timezone === zone.name
      ? (zone.mainCities[0] || timezone.split('/').at(-1).replaceAll('_', ' '))
      : timezone.split('/').at(-1).replaceAll('_', ' '),
    country: zone.countryName,
    countryCode: zone.countryCode,
    aliases: [...new Set([
      ...(zone.mainCities || []),
      zone.alternativeName,
      zone.abbreviation,
      ...(aliases[timezone] || []),
      ...(aliases[zone.name] || []),
    ].filter(Boolean))],
  })))
  .filter((record, index, all) =>
    !record.timezone.startsWith('Etc/') &&
    all.findIndex((candidate) => candidate.timezone === record.timezone) === index
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

await writeFile(
  new URL('../data/timezones.json', import.meta.url),
  `${JSON.stringify(records, null, 2)}\n`,
);
console.log(`Wrote ${records.length} timezone records.`);
```

- [ ] **Step 4: Generate and inspect the packaged dataset**

Run:

```bash
npm run data:build
node -e "const d=require('./data/timezones.json'); console.log(d.length, d.find(x=>x.timezone==='Asia/Baghdad'))"
```

Expected: hundreds of records and an `Asia/Baghdad` record containing Baghdad plus the curated Iraq aliases.

- [ ] **Step 5: Write failing search-ranking tests**

```js
// tests/search.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { searchTimezones } from '../shared/search.js';

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
```

- [ ] **Step 6: Run the search tests to verify failure**

Run: `node --test tests/search.test.js`

Expected: FAIL because `shared/search.js` does not exist.

- [ ] **Step 7: Implement normalization, weighted ranking, lazy loading, and duplicate filtering**

Use this score order:

```js
const SCORE = {
  exactTimezone: 1000,
  exactCity: 900,
  exactAlias: 850,
  cityPrefix: 700,
  timezonePrefix: 650,
  countryExact: 600,
  tokenPrefix: 400,
  contains: 200,
};
```

`normalizeSearchText()` must lowercase, remove diacritics with `normalize('NFKD')`, replace underscores with spaces, collapse whitespace, and trim. `loadTimezoneDataset()` must cache its promise and fetch only `chrome.runtime.getURL('data/timezones.json')` by default. `searchTimezones()` must use a stable city-name tiebreaker and return no duplicates.

- [ ] **Step 8: Run search and full unit tests**

Run:

```bash
node --test tests/search.test.js
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit the dataset and search module**

```bash
git add package.json package-lock.json data scripts shared/search.js tests/search.test.js
git commit -m "feat: add packaged timezone search"
```

---

### Task 7: Build the Shared Visual System and Stateless Components

**Files:**
- Modify: `shared/shared.css`
- Create: `shared/components.js`
- Create: `tests/components-contract.test.js`

**Interfaces:**
- Consumes:
  - `ClockSnapshot` from `shared/clock-engine.js`
  - `TimezoneRecord` from `shared/search.js`
- Produces:
  - `createAppShell(options): HTMLElement`
  - `createClockCard(location, handlers): HTMLElement`
  - `updateClockCard(card, snapshot, location, settings): void`
  - `createLocationSearch(options): SearchController`
  - `createTimeConverter(options): ConverterController`
  - `createSettingsForm(options): SettingsController`
  - `createToastRegion(): { element, show(message, tone) }`
  - `renderEmptyState(container, options): void`

- [ ] **Step 1: Write a source-level contract test that prevents direct storage access in components**

```js
// tests/components-contract.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared components remain stateless and do not access Chrome storage', async () => {
  const source = await readFile(new URL('../shared/components.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /chrome\.storage/);
  assert.match(source, /export function createClockCard/);
  assert.match(source, /export function updateClockCard/);
  assert.match(source, /export function createToastRegion/);
});
```

- [ ] **Step 2: Run the contract test to verify failure**

Run: `node --test tests/components-contract.test.js`

Expected: FAIL because `shared/components.js` does not exist.

- [ ] **Step 3: Define reusable design tokens and accessibility foundations**

```css
/* shared/shared.css */
:root {
  color-scheme: dark;
  --bg: #090b12;
  --surface: rgba(25, 29, 42, 0.72);
  --surface-strong: rgba(34, 39, 56, 0.92);
  --border: rgba(255, 255, 255, 0.13);
  --text: #f7f8fb;
  --muted: #a9afc1;
  --accent: #8f7cff;
  --danger: #ff7078;
  --success: #62d9aa;
  --radius-lg: 22px;
  --radius-md: 15px;
  --shadow: 0 18px 55px rgba(0, 0, 0, 0.34);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; color: var(--text); background: var(--bg); }
button, input, select { font: inherit; }
button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 80%, white);
  outline-offset: 3px;
}
.glass {
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px) saturate(125%);
}
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

Add focused styles for `.app-shell`, `.toolbar`, `.clock-list`, `.clock-card`, `.analog-clock`, `.search-popover`, `.converter`, `.settings-form`, `.toast-region`, `.empty-state`, `.status-badge`, compact density, day/night icon states, and disabled controls. Keep normal body text at least 14px and primary digital time at least 32px in the popup.

- [ ] **Step 4: Implement the clock-card DOM contract**

Each card must contain stable selectors:

```html
<article class="clock-card glass" data-location-id="...">
  <header>
    <div>
      <h2 data-role="location-name"></h2>
      <p data-role="location-meta"></p>
    </div>
    <span data-role="day-state" aria-label="Daytime"></span>
  </header>
  <div class="clock-display" data-role="clock-display">
    <div class="analog-clock" data-role="analog" aria-hidden="true">
      <span class="hand hour" data-role="hour-hand"></span>
      <span class="hand minute" data-role="minute-hand"></span>
      <span class="hand second" data-role="second-hand"></span>
    </div>
    <time data-role="digital-time"></time>
  </div>
  <p data-role="date"></p>
  <p data-role="offset"></p>
  <div data-role="card-actions"></div>
</article>
```

`updateClockCard()` changes text, `dateTime`, hand transforms, `aria-label`, style visibility, and day/night state without replacing the card node.

- [ ] **Step 5: Implement accessible search, converter, settings, empty-state, and toast factories**

The search controller must expose:

```js
{
  element,
  open(),
  close(),
  focus(),
  setResults(records),
  setError(message),
  destroy()
}
```

Use an input with `role="combobox"`, `aria-expanded`, `aria-controls`, and keyboard handling for ArrowUp, ArrowDown, Enter, and Escape. Search result buttons must include city, country, and IANA timezone. Toasts use `role="status"` for normal messages and `role="alert"` for errors.

- [ ] **Step 6: Run the component contract and unit tests**

Run:

```bash
node --test tests/components-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit the visual system**

```bash
git add shared/shared.css shared/components.js tests/components-contract.test.js
git commit -m "feat: add shared world clock components"
```

---

### Task 8: Implement the Compact Popup Controller

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.css`
- Modify: `popup/popup.js`

**Interfaces:**
- Consumes:
  - `readConfig`, `writeConfig`, `subscribeConfig` from `shared/storage.js`
  - `startAlignedClock`, `formatClock` from `shared/clock-engine.js`
  - `loadTimezoneDataset`, `searchTimezones`, `findTimezoneRecord` from `shared/search.js`
  - `createLocation` from `shared/settings.js`
  - component factories from `shared/components.js`
- Produces: Fully usable popup with live clocks, quick add/remove/style edit, converter shortcut, settings shortcut, and direct user-gesture side-panel opening.

- [ ] **Step 1: Replace the popup shell with stable UI landmarks**

```html
<body class="popup-page">
  <main class="app-shell" id="app" aria-busy="true">
    <header class="toolbar">
      <div><p class="eyebrow">WORLD CLOCK</p><h1>My clocks</h1></div>
      <button id="settings-button" type="button" aria-label="Open settings">⚙</button>
    </header>
    <div id="warning-region" hidden></div>
    <section id="clock-list" class="clock-list" aria-label="Saved world clocks"></section>
    <footer class="popup-actions">
      <button id="add-location" type="button">Add location</button>
      <button id="converter-button" type="button">Convert time</button>
      <button id="open-side-panel" type="button">Open side panel</button>
    </footer>
  </main>
  <div id="overlay-root"></div>
  <div id="toast-root"></div>
  <script type="module" src="./popup.js"></script>
</body>
```

- [ ] **Step 2: Implement popup dimensions and scroll behavior**

```css
/* popup/popup.css */
html, body { width: 380px; min-width: 380px; }
body { min-height: 560px; max-height: 600px; overflow: hidden; }
.app-shell { height: 560px; display: grid; grid-template-rows: auto 1fr auto; padding: 18px; gap: 14px; }
.clock-list { overflow-y: auto; overscroll-behavior: contain; display: grid; gap: 12px; padding: 2px; }
.popup-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
#open-side-panel { grid-column: 1 / -1; }
```

- [ ] **Step 3: Implement initial load, incomplete-onboarding state, and live card updates**

In `popup.js`:

1. Read config and issues.
2. If onboarding is incomplete, show a banner with a button opening `onboarding/onboarding.html` through `chrome.tabs.create()`.
3. Render cards in `order` sequence.
4. Start one aligned clock based on `settings.showSeconds`.
5. On every tick, call `formatClock()` for each location and `updateClockCard()` on its existing node.
6. Stop the timer on `pagehide`.
7. Subscribe to sync changes and rerender only when configuration changes.

- [ ] **Step 4: Implement quick add, remove, and style actions with optimistic state**

When adding:

```js
const nextLocation = createLocation({
  timezone: record.timezone,
  city: record.city,
  country: record.country,
  label: '',
  clockStyle: state.config.settings.defaultClockStyle,
}, state.config.locations.length);
```

Update `state.config`, rerender immediately, then call `writeConfig()`. If saving fails, retain the edited state in the popup and show `Save failed. Retry from the side panel.` Do not silently roll back.

- [ ] **Step 5: Open the side panel directly inside the click handler**

```js
document.querySelector('#open-side-panel').addEventListener('click', async () => {
  try {
    await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    window.close();
  } catch (error) {
    toast.show('Chrome could not open the side panel. The popup is still available.', 'error');
  }
});
```

Do not place an `await` before `chrome.sidePanel.open()` that would break the direct user gesture.

- [ ] **Step 6: Manually verify the popup**

Reload the unpacked extension and verify:

- one timer updates all cards;
- the popup remains within 380 × 560 px;
- add/remove/style changes survive popup close/reopen;
- incomplete onboarding shows a recovery action;
- the explicit button opens the side panel;
- a forced rejected `chrome.sidePanel.open` displays a non-blocking error.

- [ ] **Step 7: Commit the popup**

```bash
git add popup
git commit -m "feat: implement world clock popup"
```

---

### Task 9: Implement the Responsive Side Panel Workspace

**Files:**
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.css`
- Modify: `sidepanel/sidepanel.js`

**Interfaces:**
- Consumes all shared storage, clock, converter, search, settings, and component interfaces.
- Produces: Persistent management surface with searchable add, custom labels, style controls, delete, pointer drag-and-drop, keyboard reordering, converter, settings, reset, and clear-data controls.

- [ ] **Step 1: Build semantic side-panel sections**

```html
<body class="sidepanel-page">
  <main class="app-shell" id="app" aria-busy="true">
    <header class="toolbar"><div><p class="eyebrow">WORLD CLOCK</p><h1>Time zones</h1></div></header>
    <nav class="panel-tabs" aria-label="World Clock sections">
      <button data-tab="clocks" aria-selected="true">Clocks</button>
      <button data-tab="converter" aria-selected="false">Converter</button>
      <button data-tab="settings" aria-selected="false">Settings</button>
    </nav>
    <section id="clocks-panel" data-panel="clocks">
      <button id="add-location" type="button">Add location</button>
      <div id="clock-list" class="clock-grid"></div>
    </section>
    <section id="converter-panel" data-panel="converter" hidden></section>
    <section id="settings-panel" data-panel="settings" hidden></section>
  </main>
  <div id="overlay-root"></div>
  <div id="toast-root"></div>
  <script type="module" src="./sidepanel.js"></script>
</body>
```

- [ ] **Step 2: Add responsive layout rules**

```css
/* sidepanel/sidepanel.css */
.app-shell { min-height: 100vh; padding: 18px; display: grid; align-content: start; gap: 16px; }
.clock-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 520px) { .clock-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 820px) { .clock-grid { grid-template-columns: repeat(3, minmax(220px, 1fr)); } }
.converter-layout { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 680px) { .converter-layout { grid-template-columns: 1fr auto 1fr; align-items: end; } }
```

- [ ] **Step 3: Implement card editing and synchronized saves**

Use one in-memory `state.config`. Custom label inputs save on blur/Enter. Clock style select changes save immediately. Remove requires a small inline confirmation. Adding a 25th location disables the add control and shows `Maximum 24 locations reached.`

Rapid reorder operations must call `createDebouncedWriter(writeConfig, 250).schedule(state.config)`. Flush pending order changes on `pagehide`.

- [ ] **Step 4: Implement pointer drag-and-drop plus keyboard alternatives**

Each card gets `draggable="true"`, a drag handle labelled `Drag to reorder`, and **Move up / Move down** buttons for keyboard users. On drop or button activation:

```js
function moveLocation(config, fromIndex, toIndex) {
  const locations = [...config.locations];
  const [moved] = locations.splice(fromIndex, 1);
  locations.splice(toIndex, 0, moved);
  return {
    ...config,
    locations: locations.map((location, order) => ({ ...location, order })),
  };
}
```

Announce the new position through a polite live region: `London moved to position 2 of 5.`

- [ ] **Step 5: Wire the time converter**

Use saved locations for source and destination selectors. Initialize source to the local timezone when available and destination to the next saved location. Validate date/time before conversion. Show:

- converted date, weekday, and time;
- UTC offset;
- `Previous day` or `Next day` badge when `dayDifference` is nonzero;
- ambiguity selector with `First occurrence` / `Second occurrence` when applicable;
- forward-adjustment message for nonexistent local time.

The swap button exchanges source and destination without changing the source wall date/time.

- [ ] **Step 6: Wire global settings and destructive controls**

Settings controls modify:

```js
{
  timeFormat: '12h' | '24h',
  defaultClockStyle: 'analog' | 'digital' | 'combined',
  showSeconds: boolean,
  density: 'compact' | 'comfortable',
  reducedMotion: boolean
}
```

Changing `showSeconds` must stop and restart the page's aligned timer. `Reset onboarding` sets `onboardingComplete` to `false` and opens onboarding. `Clear saved locations` requires confirmation and keeps a single detected local timezone so the extension never becomes unusable.

- [ ] **Step 7: Manually verify sync between open views**

Keep the side panel open, open the popup, and verify changes propagate in both directions through `chrome.storage.onChanged`: label, style, add, remove, order, seconds, and time format.

- [ ] **Step 8: Commit the side panel**

```bash
git add sidepanel
git commit -m "feat: implement world clock side panel"
```

---

### Task 10: Implement First-Run Onboarding and Recovery

**Files:**
- Modify: `onboarding/onboarding.html`
- Modify: `onboarding/onboarding.css`
- Modify: `onboarding/onboarding.js`
- Modify: `background/service-worker.js`

**Interfaces:**
- Consumes shared settings, storage, search, and components.
- Produces: Four-step onboarding that detects local timezone, chooses locations, selects time format and default style, and persists an approved initial configuration.

- [ ] **Step 1: Build a four-step semantic form**

Use one `<form id="onboarding-form">` with fieldsets:

1. Local timezone confirmation.
2. Additional location multi-select search.
3. 12-hour or 24-hour format.
4. Analog, digital, or combined default style.

Provide Back, Continue, and Finish buttons. Keep all fieldsets in the DOM and use `hidden` for inactive steps so labels remain correctly associated.

- [ ] **Step 2: Detect and resolve the local timezone against the packaged dataset**

```js
const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dataset = await loadTimezoneDataset();
const localRecord = findTimezoneRecord(dataset, localTimezone) || {
  timezone: localTimezone,
  city: localTimezone.split('/').at(-1).replaceAll('_', ' '),
  country: '',
  aliases: [],
};
```

Preselect this record and prevent its removal during onboarding.

- [ ] **Step 3: Persist only on Finish and preserve a recoverable incomplete state before that**

On page load, write a local-only default config only when no config exists. On Finish, build ordered locations, set `onboardingComplete: true`, apply selected settings, call `writeConfig()`, then show a success screen with `Open the extension` instructions. If save fails, leave the form values visible and show the storage error.

- [ ] **Step 4: Make first-install launch idempotent**

Keep the service worker listener limited to install reason:

```js
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== chrome.runtime.OnInstalledReason.INSTALL) return;
  chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
});
```

Do not reopen onboarding on update, browser restart, or service-worker wake.

- [ ] **Step 5: Manually verify onboarding paths**

- Fresh install opens onboarding once.
- Local timezone is preselected.
- Search accepts city and IANA timezone.
- Browser Back/Forward is not required; form Back/Continue works.
- Closing before Finish leaves a local clock and recovery banner in the popup.
- Finish persists selected locations and settings.
- Reset onboarding from the side panel opens the flow again.

- [ ] **Step 6: Commit onboarding**

```bash
git add onboarding background/service-worker.js
git commit -m "feat: add world clock onboarding"
```

---

### Task 11: Add Chromium Extension Integration Tests

**Files:**
- Modify: `package.json`
- Create: `playwright.config.js`
- Create: `tests/helpers/extension-fixture.js`
- Create: `tests/integration/extension.spec.js`

**Interfaces:**
- Consumes: Built extension source directly from the repository root.
- Produces: Repeatable integration coverage for onboarding, popup rendering, side panel page, sync propagation, reordering, style changes, and converter swapping.

- [ ] **Step 1: Install Playwright and its Chromium browser**

Run:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Configure serial extension tests**

```js
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
```

- [ ] **Step 3: Create a persistent-context extension fixture**

```js
// tests/helpers/extension-fixture.js
import { test as base, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export { expect } from '@playwright/test';
```

When running in Linux CI, execute Playwright under `xvfb-run` because extension loading uses a headed persistent Chromium context.

- [ ] **Step 4: Write the first failing integration test for incomplete onboarding and popup clocks**

```js
// tests/integration/extension.spec.js
import { test, expect } from '../helpers/extension-fixture.js';

test('shows a local clock and onboarding recovery in the popup', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await expect(popup.getByRole('heading', { name: 'My clocks' })).toBeVisible();
  await expect(popup.getByText(/Finish setup/i)).toBeVisible();
  await expect(popup.locator('[data-role="digital-time"]')).toHaveCount(1);
});
```

- [ ] **Step 5: Run the integration test and repair fixture/page selectors until it passes**

Run: `npm run test:integration -- --grep "local clock"`

Expected: PASS after the implemented UI selectors match the test contract.

- [ ] **Step 6: Add complete critical-flow coverage**

Add tests that:

1. Open onboarding, select London, choose 24-hour combined style, and finish.
2. Verify popup has Baghdad/local plus London.
3. Open side-panel page directly and rename London to `Head Office`.
4. Open a second popup page and verify the label syncs without reload.
5. Change London to digital-only and verify the analog element is hidden.
6. Use Move up to reorder and verify persisted DOM order after reopening.
7. Open converter, select Baghdad → London, enter `2026-07-27 09:00`, and verify `07:00`.
8. Swap source and destination and verify selector values exchange.
9. Remove London and verify it disappears in the other open page.

- [ ] **Step 7: Run all tests**

Run:

```bash
npm run test:all
```

Expected: all unit and integration tests PASS.

- [ ] **Step 8: Commit the integration harness**

```bash
git add package.json package-lock.json playwright.config.js tests/helpers/extension-fixture.js tests/integration/extension.spec.js
git commit -m "test: cover world clock extension flows"
```

---

### Task 12: Complete Accessibility, Performance, Error Recovery, and Packaging

**Files:**
- Modify: `shared/components.js`
- Modify: `shared/shared.css`
- Modify: `popup/popup.js`
- Modify: `sidepanel/sidepanel.js`
- Modify: `onboarding/onboarding.js`
- Modify: `tests/integration/extension.spec.js`
- Create: `README.md`

**Interfaces:**
- Consumes: Entire implemented extension.
- Produces: Release-ready local package satisfying all version 1 acceptance criteria.

- [ ] **Step 1: Add integration assertions for keyboard and accessible names**

Extend the Playwright suite to verify:

```js
await expect(page.getByRole('button', { name: 'Add location' })).toBeVisible();
await expect(page.getByRole('button', { name: /Move London up/i })).toBeVisible();
await page.keyboard.press('Tab');
await expect(page.locator(':focus-visible')).toBeVisible();
await expect(page.locator('[role="alert"]')).toHaveCount(0);
```

Also assert that changing the live clock does not replace the card node and that the clock's accessible label updates while its live region is `aria-live="off"` or non-live to avoid announcements every minute.

- [ ] **Step 2: Add explicit corrupted-record and storage-failure recovery checks**

Use `chrome.storage.sync.set()` from an extension page to inject one invalid timezone beside one valid timezone. Verify the valid card renders, settings shows a recoverable warning, and the broken record can be removed. Stub `chrome.storage.sync.set` in a page-level test to reject with a quota-like error and verify the UI distinguishes quota failure from a general save failure.

- [ ] **Step 3: Verify one timer per visible page**

Instrument `startAlignedClock()` in a development test seam or expose a non-production counter only when `globalThis.__WORLD_CLOCK_TEST__` exists. Open a side-panel page with 12 clocks and assert one timer starts, not 12. Remove the test seam from normal output by guarding every reference.

- [ ] **Step 4: Run manual accessibility and responsive acceptance**

Verify:

- keyboard-only add, edit, remove, reorder, tabs, converter, and settings;
- visible focus on every control;
- 200% zoom without clipped controls;
- popup at 380 px width;
- side panel at roughly 320 px, 520 px, and 820 px widths;
- `prefers-reduced-motion: reduce` disables decorative motion;
- day/night state has text or accessible labels, not colour alone;
- icon-only buttons have semantic names;
- text and control contrast is readable against glass surfaces.

- [ ] **Step 5: Run manual privacy and offline acceptance**

In Chrome DevTools Network panel, filter to all requests while opening popup, side panel, search, onboarding, and converter. Expected: only packaged `chrome-extension://` resources. Disable network and repeat the flows. Inspect `manifest.json` and `chrome://extensions` to confirm there are no host permissions, content scripts, history access, location permission, or analytics.

- [ ] **Step 6: Write installation and verification documentation**

```markdown
# World Clock Chrome Extension

## Load locally
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose this repository directory.
5. Pin **World Clock** to the toolbar.

## Commands
- `npm test` — unit tests
- `npm run test:integration` — Chromium extension tests
- `npm run test:all` — complete automated suite
- `npm run data:build` — regenerate packaged timezone metadata

## Supported platform
Google Chrome 116 or newer. The extension uses only Chrome Sync storage and the Side Panel API.

## Privacy
No content scripts, host permissions, analytics, browsing-history access, location permission, accounts, or runtime network requests.
```

Add a short manual acceptance checklist matching the twelve acceptance criteria in the approved specification.

- [ ] **Step 7: Run final verification**

Run:

```bash
npm run data:build
git diff --exit-code data/timezones.json
npm run test:all
git status --short
```

Expected:

- regenerated dataset is identical to the committed file;
- all automated tests pass;
- only intended final documentation or verified changes appear in Git status.

- [ ] **Step 8: Create a local release archive**

Run:

```bash
zip -r world-clock-extension-v1.0.0.zip \
  manifest.json background popup sidepanel onboarding shared data assets README.md \
  -x '*.DS_Store'
```

Verify the archive contains no `node_modules`, tests, development scripts, Git metadata, or external code.

- [ ] **Step 9: Commit the release hardening**

```bash
git add README.md shared popup sidepanel onboarding tests/integration/extension.spec.js
git commit -m "chore: harden and document world clock v1"
```

---

## Plan Self-Review Results

- **Specification coverage:** Every approved requirement maps to Tasks 1–12: Manifest and permissions, Chrome Sync, clock styles, local-time day/night indicator, city/timezone search, onboarding, popup, side panel, drag-and-drop plus keyboard reordering, converter DST handling, error recovery, accessibility, privacy, offline operation, tests, and packaging.
- **Scope:** The plan excludes alarms, notifications, weather, calendars, meeting overlap, working-hours overlays, external accounts, cross-browser packaging, runtime search APIs, analytics, and extra themes.
- **Type consistency:** `Config`, `Location`, `Settings`, `ClockSnapshot`, `WallResolution`, and `TimezoneRecord` names and function signatures are consistent across producer and consumer tasks.
- **Dependency boundary:** `@vvo/tzdb` and Playwright are development-only. The packaged extension runs with browser APIs and checked-in static data only.
- **No hidden fallback:** Storage remains Chrome Sync only, matching the approved choice.
