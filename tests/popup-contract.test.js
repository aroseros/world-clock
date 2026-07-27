import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('popup exposes the approved quick actions and shared controllers', async () => {
  const html = await readFile(new URL('../popup/popup.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../popup/popup.js', import.meta.url), 'utf8');
  assert.match(html, /<h1>My clocks<\/h1>/);
  assert.match(html, /id="add-location"/);
  assert.match(html, /id="converter-button"/);
  assert.match(html, /id="open-side-panel"/);
  assert.match(source, /startAlignedClock/);
  assert.match(source, /subscribeConfig/);
  assert.match(source, /chrome\.sidePanel\.open/);
  assert.doesNotMatch(source, /setInterval/);
});
