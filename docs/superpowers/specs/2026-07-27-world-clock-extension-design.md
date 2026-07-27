# World Clock Chrome Extension — Product and Technical Design

**Status:** Approved design specification  
**Date:** 2026-07-27  
**Target:** Google Chrome, Manifest V3, Chrome 116+

## 1. Product goal

Build a polished world-clock extension that gives users two complementary views:

- a compact toolbar popup for quick time checks;
- a persistent Chrome side panel that can be opened from the popup and remain available while browsing.

Version 1 focuses on world clocks and a timezone converter. It does not include weather, alarms, calendars, accounts, meeting-overlap recommendations, or external web services.

## 2. Approved product direction

The selected direction is a visual world clock with a dark glass-style interface inspired by the approved mockup. It should feel refined and modern while remaining readable, fast, and practical.

Each saved location can independently display:

- analog clock;
- digital clock;
- combined analog and digital clock.

The extension supports city-name and timezone-name search, onboarding, custom location labels, drag-to-reorder in the side panel, Chrome Sync, and a date/time converter.

## 3. User experience

### 3.1 First launch

The first-run onboarding experience will:

1. Detect the browser's local IANA timezone and preselect it.
2. Let the user search for additional cities or timezone identifiers.
3. Ask whether to use 12-hour or 24-hour time.
4. Ask for the initial default clock style: analog, digital, or combined.
5. Save the completed configuration to `chrome.storage.sync`.

If onboarding is dismissed before completion, the popup will show the detected local timezone and a clear action to finish setup.

### 3.2 Popup

The popup is the fast-access surface. Its target size is approximately 380 × 560 CSS pixels.

It contains:

- extension title and settings action;
- saved location cards in the user's chosen order;
- city or custom label;
- current date;
- UTC offset;
- analog, digital, or combined display;
- a simple local-hour day/night state;
- add-location action;
- time-converter shortcut;
- explicit button to open the side panel.

The popup is optimized for viewing and quick edits. Full reordering and expanded management occur in the side panel.

### 3.3 Side panel

The side panel is the persistent workspace. It contains:

- responsive saved-location card grid or list, depending on panel width;
- add-location search;
- drag-and-drop ordering;
- edit custom label;
- per-location clock-style selection;
- remove-location action;
- time converter;
- global settings;
- onboarding reset and clear-data controls.

The side panel remains useful at narrow widths and does not require access to the current webpage.

### 3.4 Search experience

Search accepts:

- city names;
- country names;
- IANA timezone identifiers such as `Asia/Baghdad`;
- common aliases included in the packaged dataset.

Search provides keyboard navigation and a clear no-results state. The same timezone cannot be saved twice, but users may assign a custom label to a saved location.

The search dataset is bundled with the extension. Version 1 makes no runtime network request.

### 3.5 Time converter

The converter includes:

- source location;
- destination location;
- source date;
- source time;
- swap action;
- converted destination date and time;
- day difference indicator when the result falls on the previous or following calendar day.

Conversion uses IANA timezone rules through the browser's internationalization engine. It must correctly account for daylight-saving transitions. When a requested local wall time is nonexistent or ambiguous, the interface explains the adjustment rather than silently presenting a misleading result.

## 4. Visual system

### 4.1 Direction

The approved visual direction uses:

- dark translucent surfaces;
- soft depth and restrained blur;
- subtle borders and highlights;
- rounded cards and controls;
- limited accent colour for active states;
- clear typography and strong time hierarchy.

The implementation must avoid excessive blur, low-contrast text, or decorative effects that reduce legibility.

### 4.2 Responsive behaviour

The popup has a fixed extension-friendly layout. The side panel responds from narrow to wide widths:

- narrow: single-column cards;
- medium: compact grid where space permits;
- wide: expanded cards and converter layout.

### 4.3 Accessibility

Version 1 will include:

- keyboard access for all interactive controls;
- visible focus indicators;
- semantic labels for icon-only buttons;
- reduced-motion support;
- sufficient contrast for text and controls;
- no information conveyed by colour alone;
- screen-reader-friendly clock labels that update without excessive announcements.

## 5. Technical architecture

### 5.1 Platform

- Chrome Extension Manifest V3
- Minimum Chrome version: 116
- Plain HTML, CSS, and modern JavaScript modules
- No production framework and no runtime build requirement
- No content scripts
- No host permissions
- No external API calls

Chrome 116 is the minimum because opening the extension side panel programmatically from the popup relies on `chrome.sidePanel.open()` in direct response to a user action.

### 5.2 Manifest capabilities

The manifest will declare only the permissions needed for version 1:

- `storage`
- `sidePanel`

It will define:

- an extension action with the popup page;
- a default side-panel page;
- an onboarding page opened on first install;
- the minimum supported Chrome version;
- packaged icons and static resources.

### 5.3 Project structure

```text
world-clock-extension/
├── manifest.json
├── background/
│   └── service-worker.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── onboarding/
│   ├── onboarding.html
│   ├── onboarding.css
│   └── onboarding.js
├── shared/
│   ├── clock-engine.js
│   ├── timezone-converter.js
│   ├── storage.js
│   ├── search.js
│   ├── settings.js
│   ├── components.js
│   └── shared.css
├── data/
│   └── timezones.json
├── assets/
│   └── icons/
├── tests/
│   ├── clock-engine.test.js
│   ├── timezone-converter.test.js
│   ├── storage.test.js
│   └── search.test.js
└── docs/
    └── superpowers/specs/
```

### 5.4 Component responsibilities

#### Service worker

- handles first-install onboarding launch;
- establishes side-panel behaviour when necessary;
- contains no clock timer and no persistent UI state.

#### Clock engine

- formats current time and date for an IANA timezone;
- derives UTC-offset labels;
- produces analog hand angles;
- calculates local-hour day/night state;
- shares one aligned timer per rendered page rather than one timer per card.

The day/night state is a visual local-time indicator, not an astronomical sunrise or sunset calculation. Version 1 treats 06:00–17:59 as day and the remaining hours as night.

#### Timezone converter

- interprets source wall-clock input in a selected IANA timezone;
- resolves it to an instant;
- formats that instant in the destination timezone;
- detects invalid, nonexistent, or ambiguous local times around timezone transitions.

#### Storage layer

- owns all reads and writes to `chrome.storage.sync`;
- validates data before writes;
- batches or debounces rapid UI changes such as card reordering;
- exposes a small subscription API backed by `chrome.storage.onChanged`;
- reports quota or permission errors to the calling interface.

#### Search module

- loads the packaged timezone dataset once per page;
- normalizes names and aliases;
- ranks exact timezone matches, city matches, prefix matches, and country matches;
- prevents duplicate saved timezone identifiers.

#### Shared components

- render clock cards, empty states, search results, converter controls, and settings controls;
- accept state and callbacks rather than directly reading storage;
- remain reusable between popup, side panel, and onboarding.

## 6. Data model

All user configuration is stored under a small number of versioned sync keys to remain within Chrome Sync limits.

```js
{
  schemaVersion: 1,
  onboardingComplete: true,
  settings: {
    timeFormat: "24h",
    defaultClockStyle: "combined",
    showSeconds: false,
    density: "comfortable",
    reducedMotion: false
  },
  locations: [
    {
      id: "generated-stable-id",
      timezone: "Asia/Baghdad",
      city: "Baghdad",
      country: "Iraq",
      label: "Local",
      clockStyle: "combined",
      order: 0
    }
  ]
}
```

Rules:

- `timezone` is the canonical identity for duplicate prevention.
- `id` is used for stable rendering and reordering.
- `clockStyle` overrides the global default for that location.
- Unknown fields are ignored during reads to support future schema additions.
- Invalid records are excluded and reported without breaking the rest of the configuration.
- Version 1 supports up to 24 saved locations, which is comfortably within the product's intended use and Chrome Sync quotas.

## 7. State and data flow

1. A UI page loads its controller.
2. The controller reads validated configuration from the storage layer.
3. Shared components render the current state.
4. The clock engine starts one timer aligned to the next second or minute boundary.
5. User actions update in-memory state immediately.
6. Valid changes are persisted to Chrome Sync.
7. `chrome.storage.onChanged` propagates changes to any other open extension page.
8. The receiving page validates the new configuration and rerenders only affected elements.

The extension must continue displaying previously synchronized values while offline. Chrome handles deferred synchronization when connectivity returns.

## 8. Side-panel opening behaviour

The popup includes an explicit “Open side panel” control. Its click handler calls the Side Panel API directly within the user gesture. If opening fails, the popup shows a concise error and retains its own functionality.

Version 1 does not claim to programmatically close Chrome's side panel, because the browser controls that surface. The control is therefore presented as an open/toggle-entry action, while closure remains available through Chrome's side-panel UI.

## 9. Error handling

### Storage errors

- Do not discard current UI state silently.
- Show a concise save-failed message.
- Keep unsaved edits visible until the user retries or leaves the view.
- Surface quota errors distinctly from general storage failures.

### Invalid timezone data

- Skip an invalid saved record.
- Display a recoverable warning in settings.
- Offer removal of broken records.

### Search errors

- If the packaged dataset cannot load, show a retry action.
- Existing saved clocks must continue to work because their timezone identifiers remain stored.

### Converter errors

- Validate date and time inputs before conversion.
- Explain nonexistent local times caused by forward clock changes.
- Explain ambiguity caused by repeated local times during backward clock changes and use a clearly stated default occurrence.

### Side-panel errors

- If the Side Panel API rejects the open request, show a non-blocking message in the popup.
- The popup remains fully usable.

## 10. Performance and privacy

### Performance

- No background clock loop.
- One timer per visible extension page.
- Timer aligns to real minute or second boundaries to avoid drift.
- Seconds are disabled by default.
- Search data loads only when search is opened or needed.
- DOM updates are scoped to changing text and clock hands.

### Privacy

- No analytics in version 1.
- No account system.
- No content scripts.
- No host permissions.
- No browsing-history access.
- No location permission; local timezone detection comes from the browser environment.
- No runtime network requests.

## 11. Testing strategy

### Automated unit tests

Test the isolated modules with Node's built-in test runner:

- 12-hour and 24-hour formatting;
- date rollover across timezones;
- positive, negative, half-hour, and quarter-hour UTC offsets;
- analog hand angles;
- timer boundary calculations;
- daylight-saving transitions;
- ambiguous and nonexistent wall times;
- duplicate detection;
- search ranking;
- settings and storage validation;
- schema migration behaviour.

### Extension integration tests

Where practical, use a Chromium extension test harness for:

- first-install onboarding;
- popup rendering;
- adding and removing locations;
- per-city style changes;
- side-panel opening from a user action;
- sync propagation between popup and side panel;
- drag-and-drop ordering;
- converter source/destination swapping.

### Manual acceptance checks

- fresh installation;
- browser restart;
- Chrome Sync enabled;
- Chrome Sync disabled;
- offline operation;
- system timezone change;
- daylight-saving boundary examples;
- 12-hour and 24-hour formats;
- narrow and wide side-panel widths;
- keyboard-only operation;
- reduced-motion mode;
- corrupted saved record recovery;
- storage quota failure simulation.

## 12. Version 1 acceptance criteria

Version 1 is complete when:

1. The extension installs without warnings beyond the declared `storage` and `sidePanel` permissions.
2. Onboarding detects the local timezone and saves selected locations.
3. Users can search by city, country, alias, or IANA timezone.
4. Users can add up to 24 unique timezone locations.
5. Each saved location can use analog, digital, or combined display.
6. The popup displays live clocks and opens the side panel from an explicit click.
7. The side panel supports editing, deleting, and reordering locations.
8. Changes synchronize between simultaneously open extension views.
9. The converter handles normal and daylight-saving transition cases with clear feedback.
10. The extension works without a network connection.
11. The extension requests no host access and collects no browsing data.
12. Automated clock, converter, search, and validation tests pass.

## 13. Explicitly deferred features

The following are outside version 1:

- alarms and notifications;
- calendar integrations;
- weather and sunrise/sunset services;
- meeting-overlap finder;
- working-hours overlays;
- cloud accounts separate from Chrome Sync;
- cross-browser packaging;
- external city search APIs;
- analytics and telemetry;
- custom themes beyond the approved base visual system.

## 14. Implementation sequence

The implementation plan should proceed in this order:

1. project scaffold and manifest;
2. data schema, validation, and storage layer;
3. clock engine and converter;
4. shared visual system and reusable components;
5. popup;
6. side panel;
7. onboarding;
8. packaged timezone search dataset;
9. automated tests;
10. accessibility, performance, and manual acceptance pass;
11. packaging for local Chrome installation.
