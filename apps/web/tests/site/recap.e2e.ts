import { expect, test } from '@playwright/test';

import { API_PORT } from './playwright.config';

const TOKEN = 'DaLatRecap3Days000Token1';
const SWITCHED_OFF = 'DaLatRecap3Days000Token2';

test.describe('trip recap preview', () => {
  test('a recap link shows the public-safe recap and hands the link to the app', async ({
    page,
  }) => {
    const response = await page.goto(`/rc/${TOKEN}`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('private, no-store');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Đà Lạt, the recap');
    const ticket = page.getByTestId('recap-ticket');
    await expect(ticket).toContainText('Trip recap · October 2026');
    await expect(page.getByTestId('recap-byline')).toHaveText('With Anna, Ben, and Cora');
    const chips = page.getByTestId('recap-chips').getByRole('listitem');
    await expect(chips).toHaveText(['3 days', 'Crew of 4', 'About 41 km', '5 critters found']);
    await expect(page.getByTestId('recap-places').getByRole('listitem')).toHaveText([
      /Hồ Xuân Hương/u,
      /Chợ Đà Lạt/u,
      /Langbiang/u,
    ]);
    await expect(ticket).toContainText('and 11 more places');
    await expect(page.getByTestId('open-in-app')).toHaveText('Open in CritterPass');
    await expect(page.getByTestId('open-in-app')).toHaveAttribute(
      'href',
      new RegExp(`/app/recap-link/${TOKEN}$`, 'u'),
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      `https://critterpass.app/og/recap/${TOKEN}.png`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const card = await page.request.get(`/og/recap/${TOKEN}.png`);
    expect(card.status()).toBe(200);
    expect(card.headers()['content-type']).toBe('image/png');
  });

  test('a link switched off after a first view is gone on the next, page and card', async ({
    page,
  }) => {
    expect((await page.goto(`/rc/${SWITCHED_OFF}`))?.status()).toBe(200);
    await page.request.post(`http://127.0.0.1:${API_PORT}/__revoke/${SWITCHED_OFF}`);
    expect((await page.goto(`/rc/${SWITCHED_OFF}`))?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This recap is no longer shared',
    );
    await expect(page.getByTestId('recap-ticket')).toHaveCount(0);
    expect((await page.request.get(`/og/recap/${SWITCHED_OFF}.png`)).status()).toBe(404);
  });

  test('an unknown or malformed recap link answers 404, and a referral code stays a referral', async ({
    page,
  }) => {
    expect((await page.goto('/rc/NoSuchRecapLinkToken0001'))?.status()).toBe(404);
    expect((await page.goto('/rc/short'))?.status()).toBe(404);
    expect((await page.goto('/r/WYNST8'))?.status()).toBe(200);
    await expect(page.getByTestId('recap-ticket')).toHaveCount(0);
  });
});
