import { expect, test } from '@playwright/test';

import { critters, places } from '@cp/critter-art';

test.describe('home', () => {
  test('renders every section the header and footer link to', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('CritterPass');
    for (const id of ['how-it-works', 'the-locals', 'the-pass', 'get-the-app']) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
    }
    await expect(
      page.getByRole('heading', { level: 2, name: 'Every place has a local' }),
    ).toBeVisible();
    await expect(page.locator('.home-guide')).toHaveCount(6);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://critterpass.app/',
    );
  });

  test('the pass counts come from the critter set', async ({ page }) => {
    await page.goto('/');
    const stats = page.locator('.home-pass-section__stats');
    await expect(stats.locator('dd').first()).toHaveText(String(critters.length));
    await expect(stats.locator('dd').nth(1)).toHaveText(String(places.length));
    await expect(page.locator('.home-pass-book__tile')).toHaveCount(20);
  });

  test('store badges are the official artwork linking to the production listings', async ({
    page,
  }) => {
    await page.goto('/');
    const badges = page.getByTestId('store-badges').first();
    await expect(badges.getByRole('link', { name: 'Download on the App Store' })).toHaveAttribute(
      'href',
      'https://apps.apple.com/app/id6816655856',
    );
    await expect(badges.getByRole('link', { name: 'Get it on Google Play' })).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=app.critterpass',
    );
    await expect(badges.locator('img').first()).toHaveAttribute('src', '/badges/app-store-en.svg');
  });

  test('critters draw on when they scroll into view', async ({ page }) => {
    await page.goto('/');
    const sticker = page.locator('.home-guide critter-sticker').first();
    await expect(sticker.locator('canvas')).toHaveCount(0);
    await sticker.scrollIntoViewIfNeeded();
    await expect(sticker.locator('canvas')).toHaveCount(1);
  });

  test('with reduced motion the ticker and stickers hold still', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const animation = await page
      .locator('.cs-ticker__track')
      .evaluate((element) => getComputedStyle(element).animationName);
    expect(animation).toBe('none');
    await context.close();
  });
});
