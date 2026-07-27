import { formatClock, getZonedParts, startAlignedClock } from '../shared/clock-engine.js';
import {
  createClockCard,
  createLocationSearch,
  createSettingsForm,
  createTimeConverter,
  createToastRegion,
  renderEmptyState,
  updateClockCard,
} from '../shared/components.js';
import { convertWallTime } from '../shared/timezone-converter.js';
import { loadTimezoneDataset, searchTimezones } from '../shared/search.js';
import { createLocation, MAX_LOCATIONS } from '../shared/settings.js';
import {
  createDebouncedWriter,
  readConfig,
  subscribeConfig,
  writeConfig,
} from '../shared/storage.js';

const app = document.querySelector('#app');
const clockList = document.querySelector('#clock-list');
const addButton = document.querySelector('#add-location');
const countLabel = document.querySelector('#location-count');
const warningRegion = document.querySelector('#warning-region');
const converterPanel = document.querySelector('#converter-panel');
const settingsPanel = document.querySelector('#settings-panel');
const announcer = document.querySelector('#reorder-announcer');
const toast = createToastRegion();
document.querySelector('#toast-root').append(toast.element);

const state = {
  config: null,
  issues: [],
  cards: new Map(),
  stopClock: null,
  unsubscribe: null,
  datasetPromise: null,
  activeTab: 'clocks',
};

function sortedLocations() {
  return [...state.config.locations].sort((a, b) => a.order - b.order);
}

function applyPreferences() {
  document.body.dataset.density = state.config.settings.density;
  document.body.classList.toggle('reduce-motion', state.config.settings.reducedMotion);
}

function storageMessage(error) {
  return error?.storageCode === 'quota'
    ? 'Chrome Sync quota exceeded. Changes remain visible but are not saved.'
    : 'World Clock could not save this change to Chrome Sync.';
}

async function persist(config = state.config, successMessage = '', { fromReorder = false } = {}) {
  if (!fromReorder) reorderWriter.cancel();
  try {
    await writeConfig(config);
    if (successMessage) toast.show(successMessage, 'success');
  } catch (error) {
    toast.show(storageMessage(error), 'error');
    throw error;
  }
}

const reorderWriter = createDebouncedWriter(async (config) => {
  await persist(config, '', { fromReorder: true });
}, 250);

function updateClocks(instant = new Date()) {
  for (const location of sortedLocations()) {
    const card = state.cards.get(location.id);
    if (!card) continue;
    updateClockCard(card, formatClock(instant, location.timezone, state.config.settings), location, state.config.settings);
  }
}

function restartClock() {
  state.stopClock?.();
  state.stopClock = startAlignedClock(updateClocks, { showSeconds: state.config.settings.showSeconds });
}

function showWarnings() {
  warningRegion.replaceChildren();
  const warnings = [];
  if (!state.config.onboardingComplete) {
    const banner = document.createElement('div');
    banner.className = 'warning-banner';
    banner.textContent = 'Setup is incomplete. Your local clock is available, but you can finish onboarding at any time.';
    warnings.push(banner);
  }
  if (state.issues.length) {
    const banner = document.createElement('div');
    banner.className = 'warning-banner';
    const title = document.createElement('strong');
    title.textContent = 'Some saved data was repaired.';
    const list = document.createElement('ul');
    list.className = 'panel-warning-list';
    for (const item of state.issues.slice(0, 4)) {
      const row = document.createElement('li');
      row.textContent = item.message;
      list.append(row);
    }
    const repair = document.createElement('button');
    repair.type = 'button';
    repair.className = 'secondary-button';
    repair.textContent = 'Save repaired settings';
    repair.addEventListener('click', async () => {
      repair.disabled = true;
      try {
        await persist(state.config, 'Repaired settings saved.');
        state.issues = [];
        showWarnings();
      } catch {
        repair.disabled = false;
      }
    });
    banner.append(title, list, repair);
    warnings.push(banner);
  }
  warningRegion.append(...warnings);
  warningRegion.hidden = warnings.length === 0;
}

function updateLocation(id, changes) {
  state.config = {
    ...state.config,
    locations: state.config.locations.map((location) => (
      location.id === id ? { ...location, ...changes } : location
    )),
  };
  renderCards();
  void persist().catch(() => {});
}

function confirmRemove(id, card) {
  const existing = card.querySelector('[data-role="remove-confirm"]');
  if (existing) return;
  const location = state.config.locations.find((item) => item.id === id);
  const confirm = document.createElement('div');
  confirm.className = 'inline-confirm';
  confirm.dataset.role = 'remove-confirm';
  confirm.setAttribute('role', 'group');
  confirm.setAttribute('aria-label', `Confirm removal of ${location.city}`);
  const text = document.createElement('span');
  text.textContent = `Remove ${location.city}?`;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary-button';
  cancel.textContent = 'Cancel';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger-button';
  remove.textContent = 'Remove';
  cancel.addEventListener('click', () => confirm.remove());
  remove.addEventListener('click', () => {
    if (state.config.locations.length <= 1) {
      toast.show('Keep at least one location.', 'error');
      return;
    }
    state.config = {
      ...state.config,
      locations: state.config.locations
        .filter((item) => item.id !== id)
        .map((item, order) => ({ ...item, order })),
    };
    renderAll();
    void persist(state.config, `${location.city} removed.`).catch(() => {});
  });
  confirm.append(text, cancel, remove);
  card.querySelector('[data-role="card-actions"]').append(confirm);
  cancel.focus();
}

function moveLocation(config, fromIndex, toIndex) {
  const locations = [...config.locations].sort((a, b) => a.order - b.order);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= locations.length || toIndex >= locations.length) return config;
  const [moved] = locations.splice(fromIndex, 1);
  locations.splice(toIndex, 0, moved);
  return {
    ...config,
    locations: locations.map((location, order) => ({ ...location, order })),
  };
}

function reorderById(id, targetIndex) {
  const ordered = sortedLocations();
  const fromIndex = ordered.findIndex((location) => location.id === id);
  if (fromIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length || fromIndex === targetIndex) return;
  const moved = ordered[fromIndex];
  state.config = moveLocation(state.config, fromIndex, targetIndex);
  renderCards();
  announcer.textContent = `${moved.city} moved to position ${targetIndex + 1} of ${ordered.length}.`;
  reorderWriter.schedule(structuredClone(state.config));
}

function renderCards() {
  applyPreferences();
  const locations = sortedLocations();
  countLabel.textContent = `${locations.length} of ${MAX_LOCATIONS} locations`;
  addButton.disabled = locations.length >= MAX_LOCATIONS;
  state.cards.clear();
  clockList.replaceChildren();
  if (!locations.length) {
    renderEmptyState(clockList, { actionLabel: 'Add location', onAction: () => search.open() });
    return;
  }
  locations.forEach((location, index) => {
    const card = createClockCard(location, {
      onLabelChange: (id, label) => updateLocation(id, { label }),
      onStyleChange: (id, clockStyle) => updateLocation(id, { clockStyle }),
      onRemove: confirmRemove,
      onMoveUp: (id) => reorderById(id, index - 1),
      onMoveDown: (id) => reorderById(id, index + 1),
      canMoveUp: index > 0,
      canMoveDown: index < locations.length - 1,
      onDragStart: () => {},
      onDrop: (sourceId, targetId) => {
        const target = sortedLocations().findIndex((item) => item.id === targetId);
        reorderById(sourceId, target);
      },
    });
    state.cards.set(location.id, card);
    clockList.append(card);
  });
  updateClocks();
}

function localDateTime() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = getZonedParts(new Date(), timeZone);
  const pad = (value) => String(value).padStart(2, '0');
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

function renderConverter() {
  converterPanel.replaceChildren();
  const locations = sortedLocations();
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localIndex = Math.max(0, locations.findIndex((location) => location.timezone === localTimeZone));
  const source = locations[localIndex] || locations[0];
  const destination = locations.find((location) => location.id !== source?.id) || source;
  const controller = createTimeConverter({
    locations,
    onConvert(values, instance) {
      try {
        const result = convertWallTime(values);
        instance.setOccurrenceVisible(result.source.status === 'ambiguous');
        const dayBadge = result.dayDifference < 0 ? 'Previous day' : result.dayDifference > 0 ? 'Next day' : '';
        instance.setResult({
          time: result.destination.time24,
          date: `${result.destination.weekday}, ${result.destination.date}`,
          offset: result.destination.offset,
          dayBadge,
          message: result.message,
        });
      } catch (error) {
        instance.setResult({ error: error.message });
      }
    },
  });
  controller.setLocations(locations, {
    sourceTimeZone: source?.timezone,
    destinationTimeZone: destination?.timezone,
  });
  const now = localDateTime();
  controller.element.querySelector('[name="date"]').value = now.date;
  controller.element.querySelector('[name="time"]').value = now.time;
  converterPanel.append(controller.element);
}

async function clearSavedLocations() {
  if (!window.confirm('Clear all saved locations and keep only your local timezone?')) return;
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const existing = state.config.locations.find((location) => location.timezone === localTimezone);
  let local = existing;
  if (!local) {
    const records = await dataset();
    const record = records.find((item) => item.timezone === localTimezone);
    local = createLocation({
      timezone: localTimezone,
      city: record?.city,
      country: record?.country,
      clockStyle: state.config.settings.defaultClockStyle,
    }, 0);
  }
  state.config = { ...state.config, locations: [{ ...local, order: 0 }] };
  renderAll();
  await persist(state.config, 'Saved locations cleared.');
}

function renderSettings() {
  settingsPanel.replaceChildren();
  const controller = createSettingsForm({
    settings: state.config.settings,
    onChange(field, value) {
      const previousSeconds = state.config.settings.showSeconds;
      state.config = {
        ...state.config,
        settings: { ...state.config.settings, [field]: value },
      };
      applyPreferences();
      renderCards();
      if (field === 'showSeconds' && previousSeconds !== value) restartClock();
      void persist().catch(() => {});
    },
    async onResetOnboarding() {
      state.config = { ...state.config, onboardingComplete: false };
      renderAll();
      try {
        await persist();
        await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
      } catch {}
    },
    onClearLocations() {
      void clearSavedLocations().catch((error) => toast.show(storageMessage(error), 'error'));
    },
  });
  settingsPanel.append(controller.element);
}

function setTab(tab) {
  if (!['clocks', 'converter', 'settings'].includes(tab)) return;
  state.activeTab = tab;
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.setAttribute('tabindex', selected ? '0' : '-1');
  });
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
}

function renderAll() {
  showWarnings();
  renderCards();
  renderConverter();
  renderSettings();
  restartClock();
  setTab(state.activeTab);
  app.setAttribute('aria-busy', 'false');
}

async function dataset() {
  state.datasetPromise ||= loadTimezoneDataset();
  return state.datasetPromise;
}

const search = createLocationSearch({
  onQuery: async (query) => searchTimezones(await dataset(), query, {
    excludedTimezones: new Set(state.config.locations.map((location) => location.timezone)),
    limit: 16,
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
      clockStyle: state.config.settings.defaultClockStyle,
    }, state.config.locations.length);
    state.config = { ...state.config, locations: [...state.config.locations, location] };
    search.close();
    renderAll();
    void persist(state.config, `${record.city} added.`).catch(() => {});
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

const tabButtons = [...document.querySelectorAll('[data-tab]')];
tabButtons.forEach((button, index) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
  button.addEventListener('keydown', (event) => {
    let targetIndex = null;
    if (event.key === 'ArrowRight') targetIndex = (index + 1) % tabButtons.length;
    if (event.key === 'ArrowLeft') targetIndex = (index - 1 + tabButtons.length) % tabButtons.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = tabButtons.length - 1;
    if (targetIndex === null) return;
    event.preventDefault();
    const target = tabButtons[targetIndex];
    setTab(target.dataset.tab);
    target.focus();
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'world-clock:set-tab') setTab(message.tab);
});

async function initialise() {
  try {
    const initial = await readConfig();
    state.config = initial.config;
    state.issues = initial.issues;
    renderAll();
    state.unsubscribe = subscribeConfig(({ config, issues }) => {
      reorderWriter.cancel();
      state.config = config;
      state.issues = issues;
      renderAll();
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
  void reorderWriter.flush().catch(() => {});
  search.destroy();
}, { once: true });

void initialise();
