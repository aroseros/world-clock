import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('interactive search and side-panel tabs expose semantic names and relationships', async () => {
  const [components, sideHtml, sideJs] = await Promise.all([
    read('shared/components.js'),
    read('sidepanel/sidepanel.html'),
    read('sidepanel/sidepanel.js'),
  ]);
  assert.match(components, /'aria-label': placeholder/);
  assert.match(sideHtml, /role="tablist"/);
  assert.match(sideHtml, /role="tab"/);
  assert.match(sideHtml, /role="tabpanel"/);
  assert.match(sideJs, /setAttribute\('tabindex'/);
});

test('repaired sync records can be persisted and storage errors remain distinct', async () => {
  const [sidePanel, popup, onboarding] = await Promise.all([
    read('sidepanel/sidepanel.js'),
    read('popup/popup.js'),
    read('onboarding/onboarding.js'),
  ]);
  assert.match(sidePanel, /Save repaired settings/);
  assert.match(sidePanel, /Chrome Sync quota exceeded/);
  assert.match(sidePanel, /could not save this change/);
  assert.match(popup, /Chrome Sync quota exceeded/);
  assert.match(onboarding, /Chrome Sync quota was exceeded/);
});

test('release documentation and packaging preserve privacy boundaries', async () => {
  const [readme, packageJson, manifest] = await Promise.all([
    read('README.md'),
    read('package.json'),
    read('manifest.json'),
  ]);
  const pkg = JSON.parse(packageJson);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(pkg.scripts.package, 'node scripts/package-release.mjs');
  assert.match(readme, /Chrome 116 or newer/);
  assert.match(readme, /No content scripts, host permissions, analytics/i);
  assert.deepEqual(parsedManifest.permissions.sort(), ['sidePanel', 'storage']);
  assert.equal(parsedManifest.host_permissions, undefined);
  assert.equal(parsedManifest.content_scripts, undefined);
});
