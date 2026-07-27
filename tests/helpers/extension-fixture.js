import { test as base, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'world-clock-playwright-'));
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      env: { ...process.env, TZ: process.env.TZ || 'Asia/Baghdad' },
      channel: executablePath ? undefined : 'chromium',
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
    });
    await context.addInitScript(() => {
      globalThis.__WORLD_CLOCK_TEST__ = { timersStarted: 0, activeTimers: 0, maxActiveTimers: 0 };
    });
    try {
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export { expect } from '@playwright/test';
