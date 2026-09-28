import { expect, test } from '@playwright/test';

const DOCS = [
  'privacy',
  'terms',
  'subscription-terms',
  'location',
  'ai',
  'affiliates',
  'community-guidelines',
  'referral-terms',
  'support',
];

test.describe('legal set', () => {
  test('every document has a current and a versioned address', async ({ request }) => {
    for (const doc of DOCS) {
      expect((await request.get(`/legal/${doc}`)).status(), doc).toBe(200);
      expect((await request.get(`/legal/${doc}/1.0.0`)).status(), doc).toBe(200);
    }
    expect((await request.get('/legal/privacy/9.9.9')).status()).toBe(404);
    expect((await request.get('/legal/no-such-doc')).status()).toBe(404);
  });

  test('privacy shows the short version, a table of contents, the review banner and the DB-IP credit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/legal/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    await expect(page.getByRole('heading', { name: 'The short version' })).toBeVisible();
    await expect(page.getByTestId('counsel-pending')).toBeVisible();
    await page
      .locator('.legal-toc')
      .getByRole('link', { name: /Who sees what/u })
      .click();
    await expect(page).toHaveURL(/#who-sees-what$/u);
    const credit = page.getByTestId('dbip-attribution');
    await expect(credit.getByRole('link', { name: 'IP geolocation by DB-IP' })).toHaveAttribute(
      'href',
      'https://db-ip.com',
    );
    await expect(credit.getByRole('link', { name: 'licensed under CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    );
    await expect(
      page.getByRole('navigation', { name: 'Documents' }).getByRole('link', { name: 'Privacy' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://critterpass.app/legal/privacy',
    );
  });

  test("the current version's own address points canonical at the document and links its history", async ({
    page,
  }) => {
    await page.goto('/legal/terms/1.0.0');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://critterpass.app/legal/terms',
    );
    await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
    await expect(page.locator('.legal-history a[aria-current="page"]')).toHaveAttribute(
      'href',
      '/legal/terms/1.0.0',
    );
  });

  test('the index lists every document and credits DB-IP', async ({ page }) => {
    await page.goto('/legal');
    await expect(page.locator('.legal-index__card')).toHaveCount(DOCS.length);
    await expect(page.getByTestId('dbip-attribution')).toBeVisible();
  });
});
