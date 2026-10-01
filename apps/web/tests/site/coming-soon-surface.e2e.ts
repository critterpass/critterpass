import { expect, test } from '@playwright/test';

import { COMING_SOON_URL } from './playwright.config';

/**
 * Until launch the production Worker serves the coming-soon surface only. These run against a
 * coming-soon build served in coming-soon mode; the same addresses are real pages on the full
 * site (the other specs in this folder).
 */
const GATED = [
  '/tips',
  '/tips/how-to-get-six-friends-to-agree',
  '/legal',
  '/legal/privacy',
  '/legal/terms/1.0.0',
  '/r',
  '/r/WYNST8',
  '/j',
  '/i/x',
  '/p/x',
  '/g/x',
  '/out/x',
  '/app',
  '/plan',
  '/locals',
  '/og/home.png',
  '/rss.xml',
];

test.describe('coming-soon mode serves the coming-soon surface only', () => {
  for (const path of GATED) {
    test(`${path} is not found`, async ({ request }) => {
      const response = await request.get(`${COMING_SOON_URL}${path}`, { maxRedirects: 0 });
      expect(response.status()).toBe(404);
    });
  }

  test('a gated address shows the 404 page, not a blank answer', async ({ page }) => {
    const response = await page.goto(`${COMING_SOON_URL}/tips`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the front door, a language address, privacy and a referral link answer', async ({
    request,
  }) => {
    for (const path of ['/', '/vi', '/privacy', '/w/somefriend']) {
      const response = await request.get(`${COMING_SOON_URL}${path}`);
      expect(response.status(), path).toBe(200);
      expect(await response.text(), path).toContain('cs-root');
    }
  });

  test('the waitlist endpoints answer', async ({ request }) => {
    const stats = await request.get(`${COMING_SOON_URL}/api/waitlist/stats`);
    expect(stats.status()).toBe(200);
    expect((await stats.json()) as { count: number }).toHaveProperty('count');
    const unknown = await request.get(`${COMING_SOON_URL}/api/waitlist/handle/nobody-here`);
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not_found' });
    const refused = await request.post(`${COMING_SOON_URL}/api/waitlist/join`, {
      data: { email: 'not-an-email', destination: 'bali', company: '' },
    });
    expect(refused.status()).toBe(400);
  });

  test('robots and the sitemap advertise the surface and nothing else', async ({ request }) => {
    const robots = await request.get(`${COMING_SOON_URL}/robots.txt`);
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap: https://critterpass.app/sitemap-index.xml');

    const index = await request.get(`${COMING_SOON_URL}/sitemap-index.xml`);
    expect(index.status()).toBe(200);
    const sitemap = await request.get(`${COMING_SOON_URL}/sitemap-0.xml`);
    expect(sitemap.status()).toBe(200);
    const paths = Array.from((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/gu), (match) =>
      new URL(match[1] ?? '').pathname.replace(/(?<=.)\/$/u, ''),
    ).sort();
    expect(paths).toEqual(
      [
        '/',
        '/en',
        '/zh-Hans',
        '/id',
        '/ja',
        '/es',
        '/pt',
        '/fr',
        '/ko',
        '/th',
        '/vi',
        '/privacy',
      ].sort(),
    );
  });
});
