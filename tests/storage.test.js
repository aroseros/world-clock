import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultConfig } from '../shared/settings.js';
import {
  classifyStorageError,
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

test('subscription ignores unrelated storage areas and keys', () => {
  const storageApi = createFakeChromeStorage();
  const received = [];
  const unsubscribe = subscribeConfig((value) => received.push(value), {
    storageApi,
    localTimezone: 'Asia/Baghdad',
  });
  storageApi.emit({ worldClockConfig: { newValue: createDefaultConfig('Asia/Baghdad') } }, 'local');
  storageApi.emit({ unrelated: { newValue: 1 } }, 'sync');
  assert.equal(received.length, 0);
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

test('debounced writer can cancel pending work', async () => {
  const writes = [];
  const writer = createDebouncedWriter(async (value) => writes.push(value), 1);
  writer.schedule({ order: 1 });
  writer.cancel();
  await new Promise((resolve) => setTimeout(resolve, 8));
  assert.deepEqual(writes, []);
});

test('classifies quota-like failures separately', () => {
  assert.deepEqual(classifyStorageError(new Error('MAX_WRITE_OPERATIONS quota exceeded')), {
    code: 'quota',
    message: 'Chrome Sync storage quota was exceeded.',
  });
  assert.equal(classifyStorageError(new Error('Disconnected')).code, 'storage');
});

test('debounced writer recovers after a rejected write', async () => {
  const writes = [];
  let shouldFail = true;
  const writer = createDebouncedWriter(async (value) => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error('temporary failure');
    }
    writes.push(value);
  }, 5);

  writer.schedule({ order: 1 });
  await assert.rejects(writer.flush(), /temporary failure/);
  writer.schedule({ order: 2 });
  await writer.flush();
  assert.deepEqual(writes, [{ order: 2 }]);
});
