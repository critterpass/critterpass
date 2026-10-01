import { expect, test } from '@playwright/test';

import { STAGING_URL } from './playwright.config';

test.describe('invite landing on a host whose app is in testing', () => {
  test('asks for the TestFlight invite and offers the code instead of the stores', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: STAGING_URL, locale: 'en-US' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();
    await page.goto('/i/SANDY4');
    await expect(page.getByTestId('app-store')).toHaveCount(0);
    await expect(page.getByTestId('google-play')).toHaveCount(0);
    const panel = page.getByTestId('in-testing');
    await expect(panel).toContainText(
      'CritterPass is in testing. Ask Winston for the TestFlight invite, then join with this code:',
    );
    await expect(page.getByTestId('testing-code')).toHaveText('SANDY4');
    // Copying hands the app the invite link, which it offers back on first launch.
    await panel.getByRole('button', { name: 'Copy' }).click();
    await expect(panel.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /^https:\/\/staging\.critterpass\.app\/i\/SANDY4$/u,
    );
    await context.close();
  });

  test("speaks the visitor's language", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: STAGING_URL, locale: 'vi-VN' });
    const page = await context.newPage();
    await page.goto('/i/SANDY4');
    const panel = page.getByTestId('in-testing');
    await expect(panel).toHaveAttribute('lang', 'vi');
    await expect(panel).toContainText('Winston');
    await expect(panel.getByRole('button', { name: 'Sao chép' })).toBeVisible();
    await context.close();
  });

  test('an iOS open tap that reached the web stays on the page', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: STAGING_URL,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    const response = await page.goto('/i/SANDY4?open=1');
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('in-testing')).toBeVisible();
    await context.close();
  });
});
