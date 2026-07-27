import {
  createDefaultConfig,
  normalizeConfig,
  validateConfigForWrite,
} from './settings.js';

export const STORAGE_KEY = 'worldClockConfig';

function defaultStorageArea() {
  return globalThis.chrome?.storage?.sync;
}

function defaultStorageApi() {
  return globalThis.chrome?.storage;
}

export async function readConfig({
  storageArea = defaultStorageArea(),
  localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
} = {}) {
  if (!storageArea?.get) {
    throw Object.assign(new Error('Chrome Sync storage is unavailable.'), { storageCode: 'storage' });
  }
  try {
    const stored = await storageArea.get(STORAGE_KEY);
    if (!stored[STORAGE_KEY]) {
      return { config: createDefaultConfig(localTimezone), issues: [] };
    }
    const { config, issues } = normalizeConfig(stored[STORAGE_KEY], localTimezone);
    return { config, issues };
  } catch (error) {
    const classified = classifyStorageError(error);
    throw Object.assign(new Error(classified.message), {
      cause: error,
      storageCode: classified.code,
    });
  }
}

export async function writeConfig(config, { storageArea = defaultStorageArea() } = {}) {
  if (!storageArea?.set) {
    throw Object.assign(new Error('Chrome Sync storage is unavailable.'), { storageCode: 'storage' });
  }
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

export function subscribeConfig(listener, {
  storageApi = defaultStorageApi(),
  localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
} = {}) {
  if (typeof listener !== 'function') throw new TypeError('A listener function is required.');
  if (!storageApi?.onChanged?.addListener) return () => {};

  const handleChange = (changes, areaName) => {
    if (areaName !== 'sync' || !Object.hasOwn(changes, STORAGE_KEY)) return;
    const raw = changes[STORAGE_KEY]?.newValue;
    const normalized = normalizeConfig(raw, localTimezone);
    listener({ config: normalized.config, issues: normalized.issues });
  };

  storageApi.onChanged.addListener(handleChange);
  return () => storageApi.onChanged.removeListener(handleChange);
}

export function createDebouncedWriter(writeFn, delayMs = 250) {
  if (typeof writeFn !== 'function') throw new TypeError('A write function is required.');
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError('Delay must be non-negative.');

  let pendingValue;
  let hasPending = false;
  let timerId;
  let activePromise = Promise.resolve();

  const runPending = () => {
    if (!hasPending) return activePromise;
    const value = pendingValue;
    pendingValue = undefined;
    hasPending = false;
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }
    const previous = activePromise.catch(() => undefined);
    activePromise = previous.then(() => writeFn(value));
    return activePromise;
  };

  return {
    schedule(value) {
      pendingValue = value;
      hasPending = true;
      if (timerId !== undefined) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = undefined;
        void runPending().catch(() => undefined);
      }, delayMs);
    },
    flush() {
      return runPending();
    },
    cancel() {
      if (timerId !== undefined) clearTimeout(timerId);
      timerId = undefined;
      pendingValue = undefined;
      hasPending = false;
    },
  };
}

export function classifyStorageError(error) {
  const text = String(error?.message || error || 'Unknown storage error');
  if (/quota|max write|bytes/i.test(text)) {
    return { code: 'quota', message: 'Chrome Sync storage quota was exceeded.' };
  }
  return { code: 'storage', message: 'World Clock could not save to Chrome Sync.' };
}
