# World Clock Chrome Extension

A privacy-first Manifest V3 extension for checking saved world clocks in a compact popup and a persistent Chrome side panel. It includes per-city analog, digital, or combined clock styles, offline city/timezone search, Chrome Sync, onboarding, keyboard reordering, and a daylight-saving-aware time converter.

## Load locally

1. Open `chrome://extensions` in Google Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project directory.
5. Pin **World Clock** to the toolbar.
6. Complete onboarding, then use **Open side panel** for the expanded view.

## Supported platform

Google Chrome 116 or newer. The extension uses the Manifest V3 Side Panel API and Chrome Sync storage.

## Commands

- `npm test` — run unit and source-contract tests.
- `npm run test:integration` — run headed Chromium extension flows with Playwright.
- `npm run test:all` — run unit tests followed by Playwright tests.
- `npm run data:build` — regenerate packaged timezone metadata from the available IANA timezone database.
- `npm run package` — create `world-clock-extension-v1.0.0.zip` containing release files only.

Install development dependencies with `npm install`. On Linux CI, run the integration suite under `xvfb-run -a npm run test:integration`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only when testing against a specific compatible Chromium binary.

## Privacy

No content scripts, host permissions, analytics, browsing-history access, location permission, external accounts, or runtime network requests are used. City search reads checked-in JSON files, timezone calculations use the browser’s `Intl` implementation, and preferences are stored only in `chrome.storage.sync`.

## Manual acceptance checklist

- [ ] A fresh install opens the four-step onboarding flow and preselects the browser timezone.
- [ ] City and IANA timezone search works without a network connection and blocks duplicates.
- [ ] The popup shows live local and saved clocks, dates, UTC offsets, and day/night text.
- [ ] Analog, digital, and combined styles can be selected per city.
- [ ] The popup opens the side panel directly from a user gesture.
- [ ] Side-panel edits synchronize to another open extension page without reloading.
- [ ] Pointer drag-and-drop and keyboard Move up/Move down controls persist ordering.
- [ ] The converter handles ordinary, ambiguous, and nonexistent daylight-saving times.
- [ ] Settings persist 12/24-hour format, seconds, density, reduced motion, and default style.
- [ ] Corrupted saved records leave valid clocks usable and can be repaired from the warning.
- [ ] Quota failures and general Chrome Sync failures display different messages.
- [ ] Keyboard focus is visible; icon buttons are named; day/night does not rely on colour alone.
- [ ] At 200% zoom, controls remain reachable in the 380 px popup and 320/520/820 px side panels.
- [ ] With the network disabled, popup, side panel, onboarding, search, and converter continue working.
- [ ] `chrome://extensions` shows only the `storage` and `sidePanel` permissions.

## Release contents

The generated ZIP contains only the manifest, service worker, UI pages, shared runtime modules, packaged timezone data, icons, and this README. Tests, development scripts, dependencies, and Git metadata are excluded.
