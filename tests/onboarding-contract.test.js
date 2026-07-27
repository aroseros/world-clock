import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('onboarding keeps four labelled steps in one form', async () => {
  const html = await readFile(new URL('../onboarding/onboarding.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../onboarding/onboarding.js', import.meta.url), 'utf8');
  assert.match(html, /<form id="onboarding-form"/);
  assert.equal((html.match(/<fieldset/g) || []).length, 4);
  assert.match(html, /id="back-button"/);
  assert.match(html, /id="continue-button"/);
  assert.match(html, /id="finish-button"/);
  assert.match(source, /findTimezoneRecord/);
  assert.match(source, /onboardingComplete: true/);
  assert.match(source, /writeConfig/);
});

test('service worker opens onboarding only for a first install', async () => {
  const source = await readFile(new URL('../background/service-worker.js', import.meta.url), 'utf8');
  assert.match(source, /reason !== chrome\.runtime\.OnInstalledReason\.INSTALL/);
  assert.match(source, /onboarding\/onboarding\.html/);
});
