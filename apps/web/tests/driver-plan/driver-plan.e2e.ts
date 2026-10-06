import { expect, test } from '@playwright/test';

import { API_PORT } from '../site/playwright.config';
import { LIVE_TOKEN, REVOKABLE_TOKEN } from './fake-driver-plans';

const api = `http://127.0.0.1:${API_PORT}`;

test.use({ viewport: { width: 360, height: 780 } });

test.describe('the driver plan page', () => {
  test('shows the shared days in English and Indonesian at 360 px, never indexed or cached', async ({
    page,
  }) => {
    const response = await page.goto(`/t/${LIVE_TOKEN}`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('private, no-store');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page).toHaveTitle('Trip plan from Winston');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Trip plan from Winston',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6 people, 2 days with you');
    await expect(page.getByText('Pickup · Villa Kayu Manis')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open pickup in Maps' })).toHaveAttribute(
      'href',
      /google\.com\/maps/u,
    );
    await expect(page.getByText('Winston, Maya, Alex, Jordan, Rin, Dev')).toBeVisible();
    // Nothing wider than the phone: the page never scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    expect(
      await page
        .locator('.dp-page')
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: 'test-results/driver-plan/plan-en.png', fullPage: true });

    await page.getByRole('link', { name: 'ID', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      '6 orang, 2 hari bersama Anda',
    );
    await expect(page.getByRole('link', { name: 'Kirim penawaran' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await page.screenshot({ path: 'test-results/driver-plan/plan-id.png', fullPage: true });
  });

  test('sends a quote with a moved stop and a tip, and refuses a tip with a link', async ({
    page,
    request,
  }) => {
    await page.goto(`/t/${LIVE_TOKEN}`);
    await page.getByRole('link', { name: 'Send a quote' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your quote');
    await page.screenshot({ path: 'test-results/driver-plan/quote-en.png', fullPage: true });

    await page.locator('textarea[name="tip"]').first().fill('Book at www.cheap-tours.com');
    await page.getByRole('button', { name: 'Send to the crew' }).click();
    await expect(page.getByRole('alert')).toContainText('Tips cannot include links');

    await page.getByLabel('Price per day').fill('Rp 700.000');
    await page.getByLabel('Jatiluwih rice terraces', { exact: true }).fill('07:00');
    await page.locator('textarea[name="tip"]').first().fill('Bring sarongs for Uluwatu.');
    await page.getByRole('button', { name: 'Send to the crew' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sent to the crew');
    await page.screenshot({ path: 'test-results/driver-plan/sent-en.png', fullPage: true });

    const replies = (await (await request.get(`${api}/__driver-plan/replies`)).json()) as {
      quote: { price_per_day_minor: number; includes: string[] };
      days: { day_no: number; retime: { ref: string; at: string }[] }[];
      tips: { text: string }[];
    }[];
    expect(replies.at(-1)).toMatchObject({
      quote: { price_per_day_minor: 700_000, includes: ['petrol', 'parking', 'tolls'] },
      days: [{ day_no: 3, retime: [{ ref: '00000000-0000-4000-8000-000000000002', at: '07:00' }] }],
      tips: [{ text: 'Bring sarongs for Uluwatu.' }],
    });
  });

  test('switches off on the request after the crew revokes, showing no trip details', async ({
    page,
    request,
  }) => {
    expect((await page.goto(`/t/${REVOKABLE_TOKEN}`))?.status()).toBe(200);
    await request.post(`${api}/__driver-plan/revoke/${REVOKABLE_TOKEN}`);
    const off = await page.goto(`/t/${REVOKABLE_TOKEN}`);
    expect(off?.status()).toBe(410);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link is switched off');
    await expect(page.getByText('Winston stopped sharing this plan on 20 Oct')).toBeVisible();
    await expect(page.getByText('Jatiluwih')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/driver-plan/switched-off-en.png', fullPage: true });
    expect((await page.goto(`/t/${REVOKABLE_TOKEN}/quote`))?.status()).toBe(410);
    expect((await page.goto('/t/unknownDriverToken00'))?.status()).toBe(404);
  });
});
