function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value !== undefined && value !== null) node.setAttribute(name, String(value));
    }
  }
  return node;
}

function labelledField(labelText, control, className = 'field') {
  const label = element('label', { className });
  label.append(element('span', { text: labelText }), control);
  return label;
}

function button(text, className = 'secondary-button', ariaLabel) {
  return element('button', {
    className,
    text,
    attrs: { type: 'button', 'aria-label': ariaLabel },
  });
}

export function createAppShell({ title, eyebrow = 'WORLD CLOCK', actions = [] } = {}) {
  const main = element('main', { className: 'app-shell', attrs: { 'aria-busy': 'true' } });
  const header = element('header', { className: 'toolbar' });
  const heading = element('div');
  heading.append(element('p', { className: 'eyebrow', text: eyebrow }), element('h1', { text: title || 'World Clock' }));
  const actionRegion = element('div', { className: 'toolbar-actions' });
  actionRegion.append(...actions);
  header.append(heading, actionRegion);
  const content = element('div', { attrs: { 'data-role': 'app-content' } });
  main.append(header, content);
  return main;
}

export function createClockCard(location, handlers = {}) {
  const card = element('article', {
    className: 'clock-card glass',
    attrs: {
      'data-location-id': location.id,
      draggable: 'false',
    },
  });
  const header = element('header');
  const identity = element('div');
  identity.append(
    element('h2', { attrs: { 'data-role': 'location-name' } }),
    element('p', { className: 'location-meta', attrs: { 'data-role': 'location-meta' } }),
  );
  const dayState = element('span', { className: 'status-badge', attrs: { 'data-role': 'day-state' } });
  dayState.append(element('span', { className: 'state-icon', attrs: { 'aria-hidden': 'true' } }), element('span', { attrs: { 'data-role': 'day-state-text' } }));
  header.append(identity, dayState);

  const display = element('div', { className: 'clock-display', attrs: { 'data-role': 'clock-display' } });
  const analog = element('div', { className: 'analog-clock', attrs: { 'data-role': 'analog', 'aria-hidden': 'true' } });
  analog.append(
    element('span', { className: 'hand hour', attrs: { 'data-role': 'hour-hand' } }),
    element('span', { className: 'hand minute', attrs: { 'data-role': 'minute-hand' } }),
    element('span', { className: 'hand second', attrs: { 'data-role': 'second-hand' } }),
  );
  const digital = element('time', { attrs: { 'data-role': 'digital-time', 'aria-live': 'off' } });
  display.append(analog, digital);

  const details = element('div', { className: 'clock-details' });
  details.append(element('p', { attrs: { 'data-role': 'date' } }), element('p', { attrs: { 'data-role': 'offset' } }));
  const actions = element('div', { className: 'card-actions', attrs: { 'data-role': 'card-actions' } });

  if (handlers.onLabelChange) {
    const input = element('input', { attrs: { type: 'text', value: location.label || '', maxlength: '50', placeholder: 'Custom label' } });
    const commit = () => handlers.onLabelChange(location.id, input.value.trim());
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    });
    actions.append(labelledField('Label', input, 'field label-field'));
  }

  if (handlers.onStyleChange) {
    const select = element('select', { attrs: { 'aria-label': `Clock style for ${location.city}` } });
    for (const [value, text] of [['combined', 'Analog + digital'], ['digital', 'Digital'], ['analog', 'Analog']]) {
      const option = element('option', { text, attrs: { value } });
      option.selected = location.clockStyle === value;
      select.append(option);
    }
    select.addEventListener('change', () => handlers.onStyleChange(location.id, select.value));
    actions.append(labelledField('Style', select, 'field style-field'));
  }

  if (handlers.onMoveUp) {
    const up = button('↑', 'icon-button', `Move ${location.city} up`);
    up.disabled = handlers.canMoveUp === false;
    up.addEventListener('click', () => handlers.onMoveUp(location.id));
    actions.append(up);
  }
  if (handlers.onMoveDown) {
    const down = button('↓', 'icon-button', `Move ${location.city} down`);
    down.disabled = handlers.canMoveDown === false;
    down.addEventListener('click', () => handlers.onMoveDown(location.id));
    actions.append(down);
  }
  if (handlers.onDragStart) {
    const drag = button('⋮⋮', 'icon-button drag-handle', `Drag ${location.city} to reorder`);
    const disableDrag = () => card.setAttribute('draggable', 'false');
    drag.addEventListener('pointerdown', () => card.setAttribute('draggable', 'true'));
    drag.addEventListener('pointerup', disableDrag);
    drag.addEventListener('pointercancel', disableDrag);
    actions.append(drag);
    card.addEventListener('dragstart', (event) => {
      card.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', location.id);
      handlers.onDragStart(location.id, event);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      disableDrag();
    });
    card.addEventListener('dragover', (event) => event.preventDefault());
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      handlers.onDrop?.(event.dataTransfer?.getData('text/plain'), location.id, event);
    });
  }
  if (handlers.onRemove) {
    const remove = button('Remove', 'danger-button', `Remove ${location.city}`);
    remove.addEventListener('click', () => handlers.onRemove(location.id, card));
    actions.append(remove);
  }

  card.append(header, display, details);
  if (actions.childElementCount) card.append(actions);
  updateClockCard(card, null, location, { showSeconds: false });
  return card;
}

export function updateClockCard(card, snapshot, location, settings = {}) {
  const name = location.label || location.city;
  card.querySelector('[data-role="location-name"]').textContent = name;
  card.querySelector('[data-role="location-meta"]').textContent = [
    location.label ? location.city : '',
    location.country,
    location.timezone,
  ].filter(Boolean).join(' · ');
  card.dataset.clockStyle = location.clockStyle;

  const analog = card.querySelector('[data-role="analog"]');
  const digital = card.querySelector('[data-role="digital-time"]');
  analog.hidden = location.clockStyle === 'digital';
  digital.hidden = location.clockStyle === 'analog';
  card.querySelector('[data-role="second-hand"]').hidden = !settings.showSeconds;

  if (!snapshot) return;
  digital.textContent = snapshot.time;
  digital.dateTime = snapshot.time;
  card.querySelector('[data-role="date"]').textContent = snapshot.date;
  card.querySelector('[data-role="offset"]').textContent = snapshot.offset;
  card.querySelector('[data-role="hour-hand"]').style.transform = `rotate(${snapshot.angles.hour}deg)`;
  card.querySelector('[data-role="minute-hand"]').style.transform = `rotate(${snapshot.angles.minute}deg)`;
  card.querySelector('[data-role="second-hand"]').style.transform = `rotate(${snapshot.angles.second}deg)`;
  const dayState = card.querySelector('[data-role="day-state"]');
  const isDay = snapshot.dayState === 'day';
  dayState.setAttribute('aria-label', isDay ? 'Daytime' : 'Night-time');
  dayState.dataset.state = snapshot.dayState;
  dayState.querySelector('.state-icon').textContent = isDay ? '☀' : '☾';
  dayState.querySelector('[data-role="day-state-text"]').textContent = isDay ? 'Day' : 'Night';
  card.setAttribute('aria-label', snapshot.ariaLabel);
}

export function createLocationSearch({
  title = 'Add a location',
  placeholder = 'Search city or timezone',
  onQuery,
  onSelect,
  onClose,
} = {}) {
  const elementRoot = element('section', { className: 'search-popover glass', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'location-search-title' } });
  const header = element('div', { className: 'search-header' });
  header.append(element('h2', { text: title, attrs: { id: 'location-search-title' } }));
  const closeButton = button('×', 'icon-button', 'Close location search');
  header.append(closeButton);
  const input = element('input', {
    attrs: {
      type: 'search', role: 'combobox', placeholder, autocomplete: 'off',
      'aria-label': placeholder, 'aria-expanded': 'false', 'aria-controls': 'timezone-search-results',
      'aria-autocomplete': 'list',
    },
  });
  const results = element('ul', { className: 'search-results', attrs: { id: 'timezone-search-results', role: 'listbox' } });
  elementRoot.append(header, input, results);
  elementRoot.hidden = true;

  let records = [];
  let activeIndex = -1;
  let destroyed = false;

  function updateActive() {
    [...results.querySelectorAll('[role="option"]')].forEach((item, index) => {
      item.setAttribute('aria-selected', String(index === activeIndex));
    });
  }

  function choose(index) {
    if (index < 0 || index >= records.length) return;
    onSelect?.(records[index]);
  }

  async function handleQuery() {
    if (!onQuery) return;
    try {
      const value = await onQuery(input.value);
      if (!destroyed && Array.isArray(value)) controller.setResults(value);
    } catch (error) {
      if (!destroyed) controller.setError(error?.message || 'Search failed.');
    }
  }

  input.addEventListener('input', handleQuery);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault(); activeIndex = Math.min(records.length - 1, activeIndex + 1); updateActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); updateActive();
    } else if (event.key === 'Enter') {
      event.preventDefault(); choose(activeIndex < 0 ? 0 : activeIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault(); controller.close();
    }
  });
  closeButton.addEventListener('click', () => controller.close());

  const controller = {
    element: elementRoot,
    open() {
      elementRoot.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      void handleQuery();
      queueMicrotask(() => input.focus());
    },
    close() {
      elementRoot.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      onClose?.();
    },
    focus() { input.focus(); },
    setResults(nextRecords) {
      records = nextRecords;
      activeIndex = records.length ? 0 : -1;
      results.replaceChildren();
      if (!records.length) {
        results.append(element('li', { className: 'empty-state', text: 'No matching locations.' }));
        return;
      }
      records.forEach((record, index) => {
        const item = element('li');
        const resultButton = element('button', {
          className: 'search-result',
          attrs: { type: 'button', role: 'option', 'aria-selected': String(index === activeIndex) },
        });
        resultButton.append(
          element('strong', { text: record.city }),
          element('span', { text: record.country }),
          element('small', { text: record.timezone }),
        );
        resultButton.addEventListener('click', () => choose(index));
        item.append(resultButton);
        results.append(item);
      });
    },
    setError(message) {
      records = [];
      activeIndex = -1;
      results.replaceChildren(element('li', { className: 'error-banner', text: message, attrs: { role: 'alert' } }));
    },
    destroy() {
      destroyed = true;
      elementRoot.remove();
    },
  };
  return controller;
}

function populateLocationSelect(select, locations, selectedTimezone) {
  select.replaceChildren();
  for (const location of locations) {
    const option = element('option', {
      text: location.label || `${location.city} — ${location.timezone}`,
      attrs: { value: location.timezone },
    });
    option.selected = location.timezone === selectedTimezone;
    select.append(option);
  }
}

export function createTimeConverter({ locations = [], onConvert, onSwap } = {}) {
  const form = element('form', { className: 'converter glass' });
  const layout = element('div', { className: 'converter-layout' });
  const source = element('select', { attrs: { name: 'sourceTimeZone' } });
  const destination = element('select', { attrs: { name: 'destinationTimeZone' } });
  const date = element('input', { attrs: { type: 'date', name: 'date', required: 'true' } });
  const time = element('input', { attrs: { type: 'time', name: 'time', required: 'true' } });
  const occurrence = element('select', { attrs: { name: 'occurrence' } });
  occurrence.append(
    element('option', { text: 'First occurrence', attrs: { value: 'earlier' } }),
    element('option', { text: 'Second occurrence', attrs: { value: 'later' } }),
  );
  const occurrenceField = labelledField('Repeated-time choice', occurrence);
  occurrenceField.hidden = true;
  populateLocationSelect(source, locations, locations[0]?.timezone);
  populateLocationSelect(destination, locations, locations[1]?.timezone || locations[0]?.timezone);
  const sourceGroup = element('div', { className: 'settings-grid' });
  sourceGroup.append(labelledField('From', source), labelledField('Date', date), labelledField('Time', time), occurrenceField);
  const swap = button('⇄', 'icon-button', 'Swap source and destination');
  const actionGroup = element('div', { className: 'converter-actions' });
  actionGroup.append(swap);
  const destinationGroup = element('div');
  destinationGroup.append(labelledField('To', destination));
  const submit = button('Convert time', 'primary-button');
  submit.type = 'submit';
  destinationGroup.append(submit);
  layout.append(sourceGroup, actionGroup, destinationGroup);
  const result = element('div', { className: 'converter-result', attrs: { 'aria-live': 'polite' } });
  result.hidden = true;
  form.append(layout, result);

  const controller = {
    element: form,
    getValues() {
      return {
        date: date.value,
        time: time.value,
        sourceTimeZone: source.value,
        destinationTimeZone: destination.value,
        occurrence: occurrence.value,
      };
    },
    setLocations(nextLocations, selections = {}) {
      populateLocationSelect(source, nextLocations, selections.sourceTimeZone || source.value);
      populateLocationSelect(destination, nextLocations, selections.destinationTimeZone || destination.value);
    },
    setResult(value) {
      result.hidden = false;
      result.replaceChildren();
      if (value.error) {
        result.setAttribute('role', 'alert');
        result.append(element('p', { text: value.error }));
        return;
      }
      result.removeAttribute('role');
      result.append(
        element('p', { className: 'result-time', text: value.time }),
        element('p', { text: value.date }),
        element('p', { text: [value.offset, value.dayBadge].filter(Boolean).join(' · ') }),
      );
      if (value.message) result.append(element('p', { text: value.message }));
    },
    setOccurrenceVisible(visible) { occurrenceField.hidden = !visible; },
  };

  swap.addEventListener('click', () => {
    const currentSource = source.value;
    source.value = destination.value;
    destination.value = currentSource;
    onSwap?.(controller.getValues());
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onConvert?.(controller.getValues(), controller);
  });
  return controller;
}

export function createSettingsForm({ settings, onChange, onResetOnboarding, onClearLocations } = {}) {
  const form = element('form', { className: 'settings-form glass' });
  const grid = element('div', { className: 'settings-grid' });
  const timeFormat = element('select');
  timeFormat.append(element('option', { text: '24-hour', attrs: { value: '24h' } }), element('option', { text: '12-hour', attrs: { value: '12h' } }));
  const defaultStyle = element('select');
  defaultStyle.append(
    element('option', { text: 'Analog + digital', attrs: { value: 'combined' } }),
    element('option', { text: 'Digital', attrs: { value: 'digital' } }),
    element('option', { text: 'Analog', attrs: { value: 'analog' } }),
  );
  const density = element('select');
  density.append(element('option', { text: 'Comfortable', attrs: { value: 'comfortable' } }), element('option', { text: 'Compact', attrs: { value: 'compact' } }));
  const showSeconds = element('input', { attrs: { type: 'checkbox' } });
  const reducedMotion = element('input', { attrs: { type: 'checkbox' } });
  const secondsLabel = element('label', { className: 'toggle-field' });
  secondsLabel.append(element('span', { text: 'Show seconds' }), showSeconds);
  const motionLabel = element('label', { className: 'toggle-field' });
  motionLabel.append(element('span', { text: 'Reduce motion' }), reducedMotion);
  grid.append(labelledField('Time format', timeFormat), labelledField('Default clock style', defaultStyle), labelledField('Card density', density), secondsLabel, motionLabel);
  const actions = element('div', { className: 'settings-actions' });
  const reset = button('Reset onboarding', 'secondary-button');
  const clear = button('Clear saved locations', 'danger-button');
  actions.append(reset, clear);
  form.append(grid, actions);

  function emit(field, value) { onChange?.(field, value); }
  timeFormat.addEventListener('change', () => emit('timeFormat', timeFormat.value));
  defaultStyle.addEventListener('change', () => emit('defaultClockStyle', defaultStyle.value));
  density.addEventListener('change', () => emit('density', density.value));
  showSeconds.addEventListener('change', () => emit('showSeconds', showSeconds.checked));
  reducedMotion.addEventListener('change', () => emit('reducedMotion', reducedMotion.checked));
  reset.addEventListener('click', () => onResetOnboarding?.());
  clear.addEventListener('click', () => onClearLocations?.());

  const controller = {
    element: form,
    setValues(values) {
      timeFormat.value = values.timeFormat;
      defaultStyle.value = values.defaultClockStyle;
      density.value = values.density;
      showSeconds.checked = values.showSeconds;
      reducedMotion.checked = values.reducedMotion;
    },
  };
  controller.setValues(settings);
  return controller;
}

export function createToastRegion() {
  const region = element('div', { className: 'toast-region', attrs: { 'aria-label': 'Notifications' } });
  return {
    element: region,
    show(message, tone = 'normal') {
      const toast = element('div', {
        className: 'toast',
        text: message,
        attrs: { role: tone === 'error' ? 'alert' : 'status', 'data-tone': tone },
      });
      region.append(toast);
      setTimeout(() => toast.remove(), 4500);
      return toast;
    },
  };
}

export function renderEmptyState(container, { title = 'No clocks yet', message = 'Add a location to get started.', actionLabel, onAction } = {}) {
  const empty = element('div', { className: 'empty-state' });
  empty.append(element('h2', { text: title }), element('p', { text: message }));
  if (actionLabel) {
    const action = button(actionLabel, 'primary-button');
    action.addEventListener('click', () => onAction?.());
    empty.append(action);
  }
  container.replaceChildren(empty);
}
