import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared components remain stateless and do not access Chrome storage', async () => {
  const source = await readFile(new URL('../shared/components.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /chrome\.storage/);
  assert.match(source, /export function createClockCard/);
  assert.match(source, /export function updateClockCard/);
  assert.match(source, /export function createToastRegion/);
});

test('drag reordering is activated only from the named handle', async () => {
  const source = await readFile(new URL('../shared/components.js', import.meta.url), 'utf8');
  assert.match(source, /draggable: 'false'/);
  assert.match(source, /drag\.addEventListener\('pointerdown'/);
  assert.match(source, /drag\.addEventListener\('pointerup'/);
  assert.match(source, /card\.setAttribute\('draggable', 'false'\)/);
});
