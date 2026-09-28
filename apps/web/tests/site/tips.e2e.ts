import { expect, test } from '@playwright/test';

const ARTICLE = '/tips/how-to-get-six-friends-to-agree';

test.describe('tips journal', () => {
  test('the index features the newest article and filters by category', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tips');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tips from the locals');
    await expect(page.getByTestId('tips-featured')).toHaveAttribute('href', ARTICLE);
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tips' }),
    ).toHaveAttribute('aria-current', 'page');
    const filters = page.getByRole('navigation', { name: 'Categories' });
    await expect(filters.getByRole('link', { name: 'All' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await filters.getByRole('link', { name: 'Money' }).click();
    await expect(page).toHaveURL(/\/tips\/money$/u);
    await expect(page.getByTestId('tips-empty')).toBeVisible();
    await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
      'href',
      '/rss.xml',
    );
  });

  test('an article carries its byline, reading time, AI disclosure, card and related tips', async ({
    page,
  }) => {
    await page.goto(ARTICLE);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'How to get six friends to agree on where to go',
    );
    await expect(page.getByText('By Tokek, Bali')).toBeVisible();
    await expect(page.getByText(/Planning · \d+ min read/u)).toBeVisible();
    await expect(page.getByTestId('ai-disclosure')).toContainText('Drafted with help from AI');
    await expect(page.locator('.tip-prose > h2')).toHaveCount(5);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://critterpass.app/og/tip/how-to-get-six-friends-to-agree.png',
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    const card = await page.request.get('/og/tip/how-to-get-six-friends-to-agree.png');
    expect(card.status()).toBe(200);
    expect(card.headers()['cache-control']).toBe('public, max-age=3600');
    expect((await page.request.get('/og/tip/no-such-tip.png')).status()).toBe(404);
  });

  test('the RSS feed lists published articles', async ({ request }) => {
    const response = await request.get('/rss.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>CritterPass tips</title>');
    expect(xml).toContain(
      '<link>https://critterpass.app/tips/how-to-get-six-friends-to-agree</link>',
    );
    expect(xml).toMatch(/<pubDate>Thu, 24 Sep 2026 00:00:00 GMT<\/pubDate>/u);
  });
});
