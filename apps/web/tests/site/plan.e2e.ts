import { expect, test } from '@playwright/test';

import { API_PORT } from './playwright.config';

const TOKEN = 'KyotoSlowly4Days0Token01';
const TAKEN_DOWN = 'KyotoSlowly4Days0Token02';

test.describe('crew plan preview', () => {
  test('a plan link shows the published plan and hands off to it in the app', async ({ page }) => {
    const response = await page.goto(`/p/${TOKEN}`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('private, no-store');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('4 days in Kyoto');
    const ticket = page.getByTestId('plan-ticket');
    await expect(page.getByTestId('plan-byline')).toHaveText('Planned by Maya, Arjun, and Jess');
    await expect(ticket).toContainText('Crew of 3');
    await expect(ticket).toContainText('April 2026');
    await expect(page.getByTestId('plan-days').getByRole('listitem')).toHaveCount(4);
    await expect(ticket).toContainText('Fushimi Inari · Nishiki Market · Gion');
    await expect(page.getByTestId('open-in-app')).toHaveText('Copy into my trip');
    await expect(page.getByTestId('open-in-app')).toHaveAttribute(
      'href',
      /\/app\/community\/plan\/0190a6f1-7aaa-7bbb-8ccc-123456789abc$/u,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      `https://critterpass.app/og/plan/${TOKEN}.png`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const card = await page.request.get(`/og/plan/${TOKEN}.png`);
    expect(card.status()).toBe(200);
    expect(card.headers()['content-type']).toBe('image/png');
  });

  test('a plan taken down after a first view is gone on the next, page and card', async ({
    page,
  }) => {
    expect((await page.goto(`/p/${TAKEN_DOWN}`))?.status()).toBe(200);
    await page.request.post(`http://127.0.0.1:${API_PORT}/__revoke/${TAKEN_DOWN}`);
    expect((await page.goto(`/p/${TAKEN_DOWN}`))?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This plan is no longer shared',
    );
    await expect(page.getByTestId('plan-ticket')).toHaveCount(0);
    expect((await page.request.get(`/og/plan/${TAKEN_DOWN}.png`)).status()).toBe(404);
  });

  test('an unknown plan link answers 404', async ({ page }) => {
    expect((await page.goto('/p/NoSuchPlanLinkToken00001'))?.status()).toBe(404);
  });
});
