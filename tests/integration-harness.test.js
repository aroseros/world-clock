import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Playwright extension harness covers the approved critical flow', async () => {
  const [packageJson, config, fixture, spec] = await Promise.all([
    read('package.json'),
    read('playwright.config.js'),
    read('tests/helpers/extension-fixture.js'),
    read('tests/integration/extension.spec.js'),
  ]);
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.scripts['test:integration'], 'playwright test');
  assert.ok(pkg.devDependencies['@playwright/test']);
  assert.match(config, /workers:\s*1/);
  assert.match(fixture, /launchPersistentContext/);
  assert.match(fixture, /--load-extension=/);
  assert.match(spec, /Head Office/);
  assert.match(spec, /2026-07-27/);
  assert.match(spec, /07:00/);
  assert.match(spec, /Move London up/);
});
