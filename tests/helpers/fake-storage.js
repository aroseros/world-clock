export function createFakeChromeStorage(initial = {}) {
  const data = structuredClone(initial);
  const listeners = new Set();

  const sync = {
    async get(key) {
      if (key === null || key === undefined) return structuredClone(data);
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map((item) => [item, structuredClone(data[item])]));
      }
      return { [key]: structuredClone(data[key]) };
    },
    async set(items) {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: structuredClone(data[key]), newValue: structuredClone(value) };
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
    emit(changes, areaName = 'sync') {
      for (const listener of listeners) listener(changes, areaName);
    },
  };
}
