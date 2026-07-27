import { createLocationSearch } from '../shared/components.js';
import { findTimezoneRecord, loadTimezoneDataset, searchTimezones } from '../shared/search.js';
import { createDefaultConfig, createLocation, MAX_LOCATIONS, SCHEMA_VERSION } from '../shared/settings.js';
import { readConfig, STORAGE_KEY, writeConfig } from '../shared/storage.js';

const app = document.querySelector('#app');
const form = document.querySelector('#onboarding-form');
const fieldsets = [...form.querySelectorAll('fieldset[data-step]')];
const backButton = document.querySelector('#back-button');
const continueButton = document.querySelector('#continue-button');
const finishButton = document.querySelector('#finish-button');
const stepIndicator = document.querySelector('#step-indicator');
const progressBar = document.querySelector('#progress-bar');
const errorRegion = document.querySelector('#error-region');
const selectedContainer = document.querySelector('#selected-locations');
const successScreen = document.querySelector('#success-screen');

const state = {
  step: 0,
  dataset: [],
  baseConfig: null,
  localRecord: null,
  selected: new Map(),
};

function showError(message = '') {
  errorRegion.textContent = message;
  errorRegion.hidden = !message;
}

function renderStep() {
  fieldsets.forEach((fieldset, index) => { fieldset.hidden = index !== state.step; });
  stepIndicator.textContent = `Step ${state.step + 1} of 4`;
  progressBar.style.width = `${(state.step + 1) * 25}%`;
  backButton.hidden = state.step === 0;
  continueButton.hidden = state.step === 3;
  finishButton.hidden = state.step !== 3;
  showError();
}

function selectedValues() {
  return [...state.selected.values()];
}

function renderSelected() {
  selectedContainer.replaceChildren();
  for (const item of selectedValues()) {
    const row = document.createElement('article');
    row.className = 'selected-location';
    const identity = document.createElement('div');
    const name = document.createElement('p');
    name.textContent = `${item.record.city}${item.record.country ? `, ${item.record.country}` : ''}`;
    const zone = document.createElement('small');
    zone.textContent = item.record.timezone;
    identity.append(name, zone);
    row.append(identity);
    if (item.record.timezone === state.localRecord.timezone) {
      const tag = document.createElement('span');
      tag.className = 'local-tag';
      tag.textContent = 'LOCAL';
      row.append(tag);
    } else {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger-button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${item.record.city}`);
      remove.addEventListener('click', () => {
        state.selected.delete(item.record.timezone);
        renderSelected();
      });
      row.append(remove);
    }
    selectedContainer.append(row);
  }
  document.querySelector('#add-onboarding-location').disabled = state.selected.size >= MAX_LOCATIONS;
}

function setRadio(name, value) {
  const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function populateFromConfig(config) {
  state.baseConfig = config;
  state.selected.clear();
  const byTimezone = new Map(config.locations.map((location) => [location.timezone, location]));
  const ordered = [...config.locations].sort((a, b) => a.order - b.order);
  for (const location of ordered) {
    const record = findTimezoneRecord(state.dataset, location.timezone) || {
      timezone: location.timezone,
      city: location.city,
      country: location.country,
      aliases: [],
    };
    state.selected.set(record.timezone, { record, existing: location });
  }
  if (!state.selected.has(state.localRecord.timezone)) {
    state.selected = new Map([
      [state.localRecord.timezone, { record: state.localRecord, existing: null }],
      ...state.selected,
    ]);
  }
  setRadio('time-format', config.settings.timeFormat);
  setRadio('clock-style', config.settings.defaultClockStyle);
  renderSelected();
}

const search = createLocationSearch({
  title: 'Choose a location',
  onQuery: async (query) => searchTimezones(state.dataset, query, {
    excludedTimezones: new Set(state.selected.keys()),
    limit: 16,
  }),
  onSelect(record) {
    if (state.selected.size >= MAX_LOCATIONS) {
      search.setError('Maximum 24 locations reached.');
      return;
    }
    state.selected.set(record.timezone, { record, existing: null });
    search.close();
    renderSelected();
  },
});
document.querySelector('#overlay-root').append(search.element);

document.querySelector('#add-onboarding-location').addEventListener('click', () => search.open());
continueButton.addEventListener('click', () => {
  if (state.step === 1 && state.selected.size === 0) {
    showError('Choose at least one location.');
    return;
  }
  state.step = Math.min(3, state.step + 1);
  renderStep();
});
backButton.addEventListener('click', () => {
  state.step = Math.max(0, state.step - 1);
  renderStep();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError();
  finishButton.disabled = true;
  const timeFormat = form.querySelector('input[name="time-format"]:checked').value;
  const defaultClockStyle = form.querySelector('input[name="clock-style"]:checked').value;
  const locations = selectedValues().map(({ record, existing }, order) => createLocation({
    id: existing?.id,
    timezone: record.timezone,
    city: record.city,
    country: record.country,
    label: existing?.label || '',
    clockStyle: defaultClockStyle,
  }, order));
  const finalConfig = {
    ...state.baseConfig,
    schemaVersion: SCHEMA_VERSION,
    onboardingComplete: true,
    settings: {
      ...state.baseConfig.settings,
      timeFormat,
      defaultClockStyle,
    },
    locations,
  };
  try {
    await writeConfig(finalConfig);
    state.baseConfig = finalConfig;
    form.hidden = true;
    document.querySelector('.progress-track').hidden = true;
    stepIndicator.hidden = true;
    successScreen.hidden = false;
  } catch (error) {
    showError(error.storageCode === 'quota'
      ? 'Chrome Sync quota was exceeded. Remove a location and try again.'
      : 'Setup could not be saved to Chrome Sync. Your selections are still here.');
  } finally {
    finishButton.disabled = false;
  }
});

document.querySelector('#open-side-panel').addEventListener('click', async () => {
  try {
    const openPromise = chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    await openPromise;
  } catch {
    showError('Chrome could not open the side panel. Use the toolbar icon instead.');
  }
});

async function initialise() {
  try {
    state.dataset = await loadTimezoneDataset();
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    state.localRecord = findTimezoneRecord(state.dataset, localTimezone) || {
      timezone: localTimezone,
      city: localTimezone.split('/').at(-1).replaceAll('_', ' '),
      country: '',
      aliases: [],
    };
    const localCard = document.querySelector('#local-timezone-card');
    const summary = document.createElement('div');
    summary.className = 'local-summary';
    const city = document.createElement('strong');
    city.textContent = `${state.localRecord.city}${state.localRecord.country ? `, ${state.localRecord.country}` : ''}`;
    const zone = document.createElement('span');
    zone.textContent = state.localRecord.timezone;
    summary.append(city, zone);
    localCard.append(summary);

    const raw = await chrome.storage.sync.get(STORAGE_KEY);
    if (!raw[STORAGE_KEY]) {
      const defaultConfig = createDefaultConfig(localTimezone, {
        city: state.localRecord.city,
        country: state.localRecord.country,
      });
      state.baseConfig = defaultConfig;
      try { await writeConfig(defaultConfig); } catch (error) { showError(error.message); }
    }
    const initial = await readConfig();
    populateFromConfig(initial.config);
    renderStep();
    app.setAttribute('aria-busy', 'false');
  } catch (error) {
    app.setAttribute('aria-busy', 'false');
    showError(error.message || 'World Clock setup could not start.');
  }
}

window.addEventListener('pagehide', () => search.destroy(), { once: true });
void initialise();
