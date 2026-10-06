/**
 * The driver's claim page end to end (built Worker, api stand-in at the network boundary): the
 * whole page switches between English and Bahasa Indonesia; YES, LIST ME needs the WhatsApp code
 * and a wrong code lists nothing; every change moves the page to a fresh key; pausing and removing
 * work from the listed page, removal after one more question; and the page stays under 60 KB on a
 * slow 3G connection.
 */
import { expect, test } from '@playwright/test';

import { API_PORT } from '../site/playwright.config';

const INVITE = '/d/made-invite01';

test.beforeEach(async ({ request }) => {
  await request.post(`http://127.0.0.1:${API_PORT}/__driver-claim/reset`);
});

test('switches the whole page between English and Bahasa Indonesia', async ({ page }) => {
  await page.goto(INVITE);
  await expect(page.locator('h1')).toContainText('A crew of 6 wants to recommend you');
  await page.getByRole('link', { name: 'ID', exact: true }).click();
  await expect(page).toHaveURL(/lang=id/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(page.locator('h1')).not.toContainText('wants to recommend you');
});

test('lists him only with the WhatsApp code, then pauses and removes', async ({ page }) => {
  await page.goto(INVITE);
  await page.getByRole('button', { name: /send me a code/i }).click();
  await expect(page.getByText('+62 812 •••• 7890').first()).toBeVisible();

  await page.getByLabel('The code').fill('000000');
  await page.getByRole('button', { name: /yes, list me/i }).click();
  await expect(page.getByRole('alert')).toContainText("That code isn't right");

  await page.getByLabel('The code').fill('123456');
  await page.getByRole('button', { name: /yes, list me/i }).click();
  await expect(page).toHaveURL(/\/d\/made-key000001$/);
  await expect(page.locator('h1')).toContainText("You're listed, Made");

  await page.getByRole('button', { name: /pause my listing/i }).click();
  await expect(page).toHaveURL(/\/d\/made-key000002$/);
  await expect(page.locator('h1')).toContainText('paused');

  await page.getByRole('button', { name: /remove my listing/i }).click();
  await expect(page.getByRole('heading', { name: /remove for good/i })).toBeVisible();
  await page.getByRole('button', { name: /yes, remove it/i }).click();
  await expect(page.locator('h1')).toContainText('Your listing is gone');

  await page.goto(INVITE);
  await expect(page.locator('h1')).toContainText('You already used this link');
});

test('no thanks deletes the invite', async ({ page }) => {
  await page.goto(INVITE);
  const [posted] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    page.getByRole('button', { name: /no thanks/i }).click(),
  ]);
  expect(posted.status(), await posted.text()).toBe(200);
  await expect(page.locator('h1')).toContainText('No problem');
});

test('stays under 60 KB on a slow 3G connection', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });
  let bytes = 0;
  client.on('Network.loadingFinished', (event: { encodedDataLength: number }) => {
    bytes += event.encodedDataLength;
  });
  await page.goto(INVITE, { waitUntil: 'networkidle' });
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(60 * 1024);
});
