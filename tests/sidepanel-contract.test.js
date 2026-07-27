import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('side panel exposes clocks, converter, and settings workspaces', async () => {
  const html = await readFile(new URL('../sidepanel/sidepanel.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../sidepanel/sidepanel.js', import.meta.url), 'utf8');
  assert.match(html, /data-tab="clocks"/);
  assert.match(html, /data-tab="converter"/);
  assert.match(html, /data-tab="settings"/);
  assert.match(source, /createDebouncedWriter/);
  assert.match(source, /convertWallTime/);
  assert.match(source, /subscribeConfig/);
  assert.match(source, /onDrop/);
  assert.doesNotMatch(source, /setInterval/);
});

test('immediate saves cancel stale debounced reorder snapshots', async () => {
  const source = await readFile(new URL('../sidepanel/sidepanel.js', import.meta.url), 'utf8');
  assert.match(source, /async function persist\(config = state\.config, successMessage = '', \{ fromReorder = false \} = \{\}\)/);
  assert.match(source, /if \(!fromReorder\) reorderWriter\.cancel\(\)/);
  assert.match(source, /persist\(config, '', \{ fromReorder: true \}\)/);
  assert.match(source, /subscribeConfig\(\(\{ config, issues \}\) => \{\s*reorderWriter\.cancel\(\)/);
});
