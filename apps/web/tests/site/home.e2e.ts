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

  test('what it costs lists the perks the server has switched on, and no price for a Trip Boost', async ({
    page,
  }) => {
    await page.goto('/');
    const pricing = page.locator('section#pricing');
    await expect(pricing.locator('.pricing-plan')).toHaveCount(3);
    const pass = pricing.locator('[data-plan="pass-plus"]');
    await expect(pass.locator('.pricing-plan__lines li')).toHaveCount(7);
    await expect(pass.locator('.pricing-plan__lines li').first()).toHaveText(
      'Unlimited guide chat, voice and camera',
    );
    await expect(pass.locator('.pricing-plan__price')).toContainText('$3.99 a month');
    const boost = pricing.locator('[data-plan="boost"]');
    await expect(boost.locator('.pricing-plan__lines li')).toHaveCount(5);
    await expect(boost.locator('.pricing-plan__price')).not.toContainText('$');
    await expect(boost.locator('.pricing-plan__price')).toContainText(
      'Price shown in the App Store and Google Play',
    );
    await expect(pricing.getByTestId('pricing-first-trip')).toBeVisible();
    // Nothing is sold on the site: the section links to the terms and to no checkout.
    await expect(pricing.locator('a')).toHaveCount(1);
    await expect(pricing.locator('a')).toHaveAttribute('href', '/legal/subscription-terms');
  });

  test('the pricing page shares the same section with a card of its own', async ({
    page,
    request,
  }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Free to plan. Extras when you want them.',
    );
    await expect(page.locator('.pricing-plan')).toHaveCount(3);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://critterpass.app/og/page/pricing.png',
    );
    const card = await request.get('/og/page/pricing.png');
    expect(card.status()).toBe(200);
    expect(card.headers()['content-type']).toBe('image/png');
    expect((await request.get('/og/page/no-such-page.png')).status()).toBe(404);
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
