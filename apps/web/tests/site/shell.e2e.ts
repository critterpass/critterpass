import { expect, test } from '@playwright/test';

test.describe('site shell', () => {
  test('header links every section', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/no-such-page');
    const header = page.getByTestId('site-header');
    const nav = header.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '/#how-it-works',
    );
    await expect(nav.getByRole('link', { name: 'The locals' })).toHaveAttribute(
      'href',
      '/#the-locals',
    );
    await expect(nav.getByRole('link', { name: 'Bring your crew' })).toHaveAttribute('href', '/r');
    await expect(nav.getByRole('link', { name: 'Tips' })).toHaveAttribute('href', '/tips');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Get the app' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'CritterPass home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  test('footer carries the legal links and only the social accounts that exist', async ({
    page,
  }) => {
    await page.goto('/no-such-page');
    const footer = page.getByTestId('site-footer');
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
    await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
    await expect(footer.getByRole('link', { name: 'Join with a code' })).toHaveAttribute(
      'href',
      '/j',
    );
    await expect(footer.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/critterpass.app',
    );
    await expect(footer.getByRole('link', { name: 'TikTok' })).toHaveCount(0);
    await expect(footer).toContainText('No cookies here');
    await expect(footer).toContainText('© 2026 CritterPass');
  });

  test('on a phone the nav folds into a drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/no-such-page');
    const header = page.getByTestId('site-header');
    await expect(header.getByRole('navigation', { name: 'Main' })).toBeHidden();
    const drawerLink = header.locator('.site-drawer__link', { hasText: 'The locals' });
    await expect(drawerLink).toBeHidden();
    await header.locator('summary').click();
    await expect(drawerLink).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawerLink).toBeHidden();
  });

  test('an unknown page answers 404 inside the site shell', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('not-found')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wrong turn');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.getByTestId('site-footer')).toBeVisible();
  });
});
