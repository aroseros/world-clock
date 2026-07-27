import { test, expect } from '../helpers/extension-fixture.js';

const extensionUrl = (extensionId, path) => `chrome-extension://${extensionId}/${path}`;

async function openPage(context, extensionId, path) {
  const page = await context.newPage();
  await page.goto(extensionUrl(extensionId, path));
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
  return page;
}

async function finishOnboarding(page) {
  await expect(page.getByRole('heading', { name: 'Set up your clocks' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Add another location' }).click();
  const search = page.getByRole('combobox', { name: 'Search city or timezone' });
  await search.fill('London');
  await page.getByRole('option', { name: /London.*Europe\/London/i }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('24-hour').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Combined').check();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Your world clocks are ready' })).toBeVisible();
}

test('shows a local clock and onboarding recovery in the popup', async ({ context, extensionId }) => {
  const popup = await openPage(context, extensionId, 'popup/popup.html');
  await expect(popup.getByRole('heading', { name: 'My clocks' })).toBeVisible();
  await expect(popup.getByText(/Finish setup to choose your cities/i)).toBeVisible();
  await expect(popup.locator('[data-role="digital-time"]')).toHaveCount(1);
});

test('completes onboarding and keeps popup and side panel in sync', async ({ context, extensionId }) => {
  const onboarding = await openPage(context, extensionId, 'onboarding/onboarding.html');
  await finishOnboarding(onboarding);

  const popup = await openPage(context, extensionId, 'popup/popup.html');
  await expect(popup.locator('.clock-card')).toHaveCount(2);
  await expect(popup.getByText('Baghdad', { exact: true })).toBeVisible();
  await expect(popup.getByText('London', { exact: true })).toBeVisible();

  const syncedPopup = await openPage(context, extensionId, 'popup/popup.html');
  const sidePanel = await openPage(context, extensionId, 'sidepanel/sidepanel.html');
  let londonCard = sidePanel.locator('.clock-card', { hasText: 'London' });
  await londonCard.getByLabel('Label').fill('Head Office');
  await londonCard.getByLabel('Label').press('Enter');
  await expect(syncedPopup.getByText('Head Office', { exact: true })).toBeVisible();

  londonCard = sidePanel.locator('.clock-card', { hasText: 'Head Office' });
  await londonCard.getByLabel('Clock style for London').selectOption('digital');
  const syncedLondon = syncedPopup.locator('.clock-card', { hasText: 'Head Office' });
  await expect(syncedLondon.locator('[data-role="analog"]')).toBeHidden();
  await expect(syncedLondon.locator('[data-role="digital-time"]')).toBeVisible();

  await londonCard.getByRole('button', { name: 'Move London up' }).click();
  await expect(sidePanel.locator('.clock-card').first()).toContainText('Head Office');
  await sidePanel.waitForTimeout(350);
  const reopened = await openPage(context, extensionId, 'sidepanel/sidepanel.html');
  await expect(reopened.locator('.clock-card').first()).toContainText('Head Office');

  await reopened.getByRole('button', { name: 'Converter' }).click();
  const from = reopened.getByLabel('From');
  const to = reopened.getByLabel('To');
  await from.selectOption('Asia/Baghdad');
  await to.selectOption('Europe/London');
  await reopened.getByLabel('Date').fill('2026-07-27');
  await reopened.getByLabel('Time').fill('09:00');
  await reopened.getByRole('button', { name: 'Convert time' }).click();
  await expect(reopened.locator('.result-time')).toHaveText('07:00');

  await reopened.getByRole('button', { name: 'Swap source and destination' }).click();
  await expect(from).toHaveValue('Europe/London');
  await expect(to).toHaveValue('Asia/Baghdad');

  await reopened.getByRole('button', { name: 'Clocks' }).click();
  const removable = reopened.locator('.clock-card', { hasText: 'Head Office' });
  await removable.getByRole('button', { name: 'Remove London' }).click();
  await removable.locator('[data-role="remove-confirm"]').getByRole('button', { name: 'Remove' }).click();
  await expect(syncedPopup.getByText('Head Office', { exact: true })).toHaveCount(0);
});


const twelveLocations = [
  ['Asia/Baghdad', 'Baghdad', 'Iraq'],
  ['Europe/London', 'London', 'United Kingdom'],
  ['America/New_York', 'New York', 'United States'],
  ['Asia/Tokyo', 'Tokyo', 'Japan'],
  ['Asia/Dubai', 'Dubai', 'United Arab Emirates'],
  ['Australia/Sydney', 'Sydney', 'Australia'],
  ['Asia/Kolkata', 'Kolkata', 'India'],
  ['Pacific/Auckland', 'Auckland', 'New Zealand'],
  ['Europe/Paris', 'Paris', 'France'],
  ['Africa/Cairo', 'Cairo', 'Egypt'],
  ['America/Los_Angeles', 'Los Angeles', 'United States'],
  ['America/Sao_Paulo', 'São Paulo', 'Brazil'],
].map(([timezone, city, country], order) => ({
  id: `seed-${order}`,
  timezone,
  city,
  country,
  label: '',
  clockStyle: 'combined',
  order,
}));

async function seedRawConfig(page, locations = twelveLocations) {
  await page.evaluate(async (seededLocations) => {
    await chrome.storage.sync.set({
      worldClockConfig: {
        schemaVersion: 1,
        onboardingComplete: true,
        settings: {
          timeFormat: '24h',
          defaultClockStyle: 'combined',
          showSeconds: false,
          density: 'comfortable',
          reducedMotion: false,
        },
        locations: seededLocations,
      },
    });
  }, locations);
}

test('keeps twelve clocks on one timer and offers accessible data repair', async ({ context, extensionId }) => {
  const seedPage = await openPage(context, extensionId, 'popup/popup.html');
  await seedRawConfig(seedPage, [
    ...twelveLocations,
    {
      id: 'broken-zone',
      timezone: 'Mars/Olympus',
      city: 'Olympus',
      country: 'Mars',
      label: '',
      clockStyle: 'combined',
      order: twelveLocations.length,
    },
  ]);

  const page = await openPage(context, extensionId, 'sidepanel/sidepanel.html');
  await expect(page.locator('.clock-card')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Add location' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move London up' })).toBeVisible();
  await expect(page.getByText('Some saved data was repaired.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save repaired settings' })).toBeVisible();
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  const timerState = await page.evaluate(() => globalThis.__WORLD_CLOCK_TEST__);
  expect(timerState.activeTimers).toBe(1);
  expect(timerState.maxActiveTimers).toBe(1);

  const london = page.locator('.clock-card', { hasText: 'London' });
  const cardHandle = await london.elementHandle();
  const sameNode = await page.evaluate(async (card) => {
    const { updateClockCard } = await import(chrome.runtime.getURL('shared/components.js'));
    const { worldClockConfig } = await chrome.storage.sync.get('worldClockConfig');
    const location = worldClockConfig.locations.find((item) => item.timezone === 'Europe/London');
    updateClockCard(card, {
      time: '07:00',
      date: 'Mon, 27 Jul 2026',
      offset: 'UTC+01:00',
      dayState: 'day',
      angles: { hour: 210, minute: 0, second: 0 },
      ariaLabel: 'London time, 07:00, Monday 27 July 2026, UTC plus 1 hour',
    }, location, worldClockConfig.settings);
    return card === document.querySelector(`[data-location-id="${location.id}"]`);
  }, cardHandle);
  expect(sameNode).toBe(true);
  await expect(london.locator('[data-role="digital-time"]')).toHaveAttribute('aria-live', 'off');
  await expect(london).toHaveAttribute('aria-label', /London time, 07:00/);

  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toBeVisible();
  await page.getByRole('button', { name: 'Save repaired settings' }).click();
  await expect(page.getByText('Some saved data was repaired.')).toHaveCount(0);
  const persisted = await page.evaluate(async () => (await chrome.storage.sync.get('worldClockConfig')).worldClockConfig);
  expect(persisted.locations).toHaveLength(12);

  await page.evaluate(() => {
    chrome.storage.sync.set = async () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  });
  await london.getByLabel('Label').fill('UK Office');
  await london.getByLabel('Label').press('Enter');
  await expect(page.getByRole('alert')).toContainText('Chrome Sync quota exceeded');
});

test('stays responsive and requests only extension resources', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(extensionUrl(extensionId, 'sidepanel/sidepanel.html'));
  await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');

  for (const width of [320, 520, 820]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  }
  expect(requests.every((url) => url.startsWith('chrome-extension://'))).toBe(true);
});
