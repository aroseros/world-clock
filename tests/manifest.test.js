import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('../manifest.json', import.meta.url), 'utf8'),
);

test('manifest exposes only the approved MV3 capabilities', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '116');
  assert.deepEqual([...manifest.permissions].sort(), ['sidePanel', 'storage']);
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.equal(manifest.side_panel.default_path, 'sidepanel/sidepanel.html');
  assert.deepEqual(manifest.background, {
    service_worker: 'background/service-worker.js',
    type: 'module',
  });
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
});
