import { formatClock, startAlignedClock } from '../shared/clock-engine.js';
import {
  createClockCard,
  createLocationSearch,
  createToastRegion,
  renderEmptyState,
  updateClockCard,
} from '../shared/components.js';
import { loadTimezoneDataset, searchTimezones } from '../shared/search.js';
import { createLocation, MAX_LOCATIONS } from '../shared/settings.js';
import { readConfig, subscribeConfig, writeConfig } from '../shared/storage.js';

const app = document.querySelector('#app');
const list = document.querySelector('#clock-list');
const warningRegion = document.querySelector('#warning-region');
const addButton = document.querySelector('#add-location');
const toast = createToastRegion();
document.querySelector('#toast-root').append(toast.element);

const state = {
  config: null,
  issues: [],
  cards: new Map(),
  stopClock: null,
  unsubscribe: null,
  datasetPromise: null,
};

function sortedLocations() {
  return [...state.config.locations].sort((a, b) => a.order - b.order);
}

function applyPreferences() {
  document.body.dataset.density = state.config.settings.density;
  document.body.classList.toggle('reduce-motion', state.config.settings.reducedMotion);
}

function updateClocks(instant = new Date()) {
  for (const location of sortedLocations()) {
    const card = state.cards.get(location.id);
    if (!card) continue;
    updateClockCard(
      card,
      formatClock(instant, location.timezone, state.config.settings),
      location,
      state.config.settings,
    );
  }
}

function restartClock() {
  state.stopClock?.();
  state.stopClock = startAlignedClock(updateClocks, {
    showSeconds: state.config.settings.showSeconds,
  });
}

function showWarnings() {
  warningRegion.replaceChildren();
  const fragments = [];
  if (!state.config.onboardingComplete) {
    const banner = document.createElement('div');
    banner.className = 'warning-banner onboarding-banner';
    const text = document.createElement('p');
    text.textContent = 'Finish setup to choose your cities and clock style.';
    const finish = document.createElement('button');
    finish.type = 'button';
    finish.className = 'secondary-button';
    finish.textContent = 'Finish setup';
    finish.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    });
    banner.append(text, finish);
    fragments.push(banner);
  }
  if (state.issues.length) {
    const repaired = document.createElement('div');
    repaired.className = 'warning-banner';
    repaired.textContent = `${state.issues.length} saved setting${state.issues.length === 1 ? '' : 's'} needed repair. Review them in the side panel.`;
    fragments.push(repaired);
  }
  warningRegion.append(...fragments);
  warningRegion.hidden = fragments.length === 0;
}

async function saveOptimistic(successMessage) {
  try {
    await writeConfig(state.config);
    if (successMessage) toast.show(successMessage, 'success');
  } catch (error) {
    const message = error.storageCode === 'quota'
      ? 'Chrome Sync quota exceeded. Your unsaved changes remain visible.'
      : 'Save failed. Retry from the side panel.';
    toast.show(message, 'error');
  }
}

function changeStyle(id, clockStyle) {
  state.config = {
    ...state.config,
    locations: state.config.locations.map((location) => (
      location.id === id ? { ...location, clockStyle } : location
    )),
  };
  renderCards();
  void saveOptimistic();
}

function removeLocation(id) {
  if (state.config.locations.length <= 1) {
    toast.show('Keep at least one location.', 'error');
    return;
  }
  state.config = {
    ...state.config,
    locations: state.config.locations
      .filter((location) => location.id !== id)
      .map((location, order) => ({ ...location, order })),
  };
  renderCards();
  void saveOptimistic('Location removed.');
}

function renderCards() {
  applyPreferences();
  state.cards.clear();
  list.replaceChildren();
  const locations = sortedLocations();
  if (!locations.length) {
    renderEmptyState(list, { title: 'No clocks found', message: 'Open setup to restore your local clock.' });
    return;
  }
  for (const location of locations) {
    const card = createClockCard(location, {
      onStyleChange: changeStyle,
      onRemove: removeLocation,
    });
    state.cards.set(location.id, card);
    list.append(card);
  }
  updateClocks();
  addButton.disabled = locations.length >= MAX_LOCATIONS;
}

function render() {
  showWarnings();
  renderCards();
  restartClock();
  app.setAttribute('aria-busy', 'false');
}

async function dataset() {
  state.datasetPromise ||= loadTimezoneDataset();
  return state.datasetPromise;
}

const search = createLocationSearch({
  onQuery: async (query) => searchTimezones(await dataset(), query, {
    excludedTimezones: new Set(state.config.locations.map((location) => location.timezone)),
    limit: 12,
  }),
  onSelect(record) {
    if (state.config.locations.length >= MAX_LOCATIONS) {
      toast.show('Maximum 24 locations reached.', 'error');
      return;
    }
    const location = createLocation({
      timezone: record.timezone,
      city: record.city,
      country: record.country,
      label: '',
      clockStyle: state.config.settings.defaultClockStyle,
    }, state.config.locations.length);
    state.config = { ...state.config, locations: [...state.config.locations, location] };
    search.close();
    renderCards();
    void saveOptimistic(`${record.city} added.`);
  },
});
document.querySelector('#overlay-root').append(search.element);

addButton.addEventListener('click', () => {
  if (state.config.locations.length >= MAX_LOCATIONS) {
    toast.show('Maximum 24 locations reached.', 'error');
    return;
  }
  search.open();
});

async function openSidePanel(tab = 'clocks') {
  try {
    const openPromise = chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    await openPromise;
    await chrome.runtime.sendMessage({ type: 'world-clock:set-tab', tab }).catch(() => {});
    window.close();
  } catch {
    toast.show('Chrome could not open the side panel. The popup is still available.', 'error');
  }
}

document.querySelector('#open-side-panel').addEventListener('click', () => openSidePanel('clocks'));
document.querySelector('#settings-button').addEventListener('click', () => openSidePanel('settings'));
document.querySelector('#converter-button').addEventListener('click', () => openSidePanel('converter'));

async function initialise() {
  try {
    const initial = await readConfig();
    state.config = initial.config;
    state.issues = initial.issues;
    render();
    state.unsubscribe = subscribeConfig(({ config, issues }) => {
      state.config = config;
      state.issues = issues;
      render();
    });
  } catch (error) {
    app.setAttribute('aria-busy', 'false');
    warningRegion.hidden = false;
    warningRegion.className = 'error-banner';
    warningRegion.textContent = error.message;
  }
}

window.addEventListener('pagehide', () => {
  state.stopClock?.();
  state.unsubscribe?.();
  search.destroy();
}, { once: true });

void initialise();
