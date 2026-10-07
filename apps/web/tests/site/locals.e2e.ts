import { expect, test } from '@playwright/test';

test.describe('public locals page', () => {
  test('shows the place, its credited photo, the count and one unnamed silhouette per critter', async ({
    page,
  }) => {
    const response = await page.goto('/locals/jp-kyoto');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kyoto');
    const place = page.getByTestId('locals-place');
    await expect(place).toContainText('The locals · Japan');
    await expect(page.getByTestId('locals-count')).toHaveText('3 critters to find here');
    const silhouettes = page.getByTestId('locals-silhouettes').getByRole('listitem');
    await expect(silhouettes).toHaveCount(3);
    await expect(silhouettes.nth(0)).toHaveAccessibleName('Unknown critter, Legendary');
    await expect(silhouettes.nth(1)).toHaveText('Rare');
    // Every critter is drawn as a single-colour outline.
    for (const sticker of await silhouettes.locator('critter-sticker').all()) {
      await expect(sticker).toHaveAttribute('variant', 'mask');
    }
    const credit = page.getByTestId('locals-photo-credit').getByRole('link');
    await expect(credit).toHaveText('Aiko T. · CC BY-SA 4.0 · Wikimedia Commons');
    await expect(credit).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:Kyoto.jpg',
    );
    // The photo comes from this site, and it loads.
    const photo = place.getByRole('img', { name: 'Kyoto, Japan' });
    await expect(photo).toHaveAttribute('src', '/api/locals/jp-kyoto/photo');
    expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByTestId('open-in-app')).toHaveText('Open in CritterPass');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://critterpass.app/og/locals/jp-kyoto.png',
    );
  });

  test('a place without a photo shows none', async ({ page, request }) => {
    expect((await page.goto('/locals/jp-nara'))?.status()).toBe(200);
    await expect(page.getByTestId('locals-count')).toBeVisible();
    await expect(page.getByTestId('locals-photo-credit')).toHaveCount(0);
    expect((await request.get('/api/locals/jp-nara/photo')).status()).toBe(404);
  });

  test('the share card is drawn for a known place only', async ({ request }) => {
    const card = await request.get('/og/locals/jp-kyoto.png');
    expect(card.status()).toBe(200);
    expect(card.headers()['content-type']).toBe('image/png');
    expect((await request.get('/og/locals/no-such-place.png')).status()).toBe(404);
  });

  test('an unknown place answers 404 with no way into a place', async ({ page, request }) => {
    expect((await page.goto('/locals/no-such-place'))?.status()).toBe(404);
    await expect(page.getByTestId('locals-place')).toHaveCount(0);
    expect((await request.get('/api/locals/no-such-place/photo')).status()).toBe(404);
  });
});
