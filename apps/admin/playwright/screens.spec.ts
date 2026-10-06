/**
 * Review screenshots of every console page at desktop and phone widths, beside the Ops renders.
 * Runs only when ADMIN_SHOTS_DIR is set:
 * `ADMIN_SHOTS_DIR=/path pnpm --filter @cp/admin exec playwright test screens.spec.ts`.
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { signInAs } from './session';

const shotsDir = process.env['ADMIN_SHOTS_DIR'];
const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

/** Every page an owner opens, by path. */
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'my-work', path: '/work' },
  { name: 'moderation', path: '/moderation' },
  { name: 'desk', path: '/desk' },
  { name: 'support', path: '/support' },
  { name: 'ideas', path: '/ideas' },
  { name: 'billing', path: '/billing' },
  { name: 'catalogue', path: '/catalogue' },
  { name: 'content', path: '/content' },
  { name: 'flags', path: '/flags' },
  { name: 'partners', path: '/partners' },
  { name: 'services', path: '/services' },
  { name: 'jobs', path: '/jobs' },
  { name: 'audit', path: '/audit' },
  { name: 'operators', path: '/operators' },
] as const;

test.skip(shotsDir === undefined, 'set ADMIN_SHOTS_DIR to capture review screenshots');

async function shot(page: Page, name: string, width: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: path.join(shotsDir ?? '', `${width}-${name}.png`),
    fullPage: true,
  });
}

for (const size of WIDTHS) {
  test(`console at ${size.name}px`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await shot(page, 'sign-in', size.name);

    await signInAs(page, 'support');
    await page.goto('/flags');
    await expect(page.getByText('Not for your role')).toBeVisible();
    await shot(page, 'state-forbidden', size.name);

    await signInAs(page, 'owner');
    for (const entry of PAGES) {
      await page.goto(entry.path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await shot(page, entry.name, size.name);
    }

    if (size.name === '390') {
      await page.goto('/');
      await page.getByRole('navigation', { name: 'Phone tabs' }).getByRole('button').click();
      await expect(page.getByRole('navigation', { name: 'Console' })).toBeVisible();
      await shot(page, 'phone-more', size.name);
    }
  });
}

test('incident banner and read-only maintenance', async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, 'ops');
  await page.getByRole('button', { name: 'Post a banner' }).click();
  const dialog = page.getByRole('dialog', { name: 'Post a banner' });
  await dialog.getByLabel('Kind').selectOption('maintenance');
  await dialog.getByLabel('What is happening').fill('Database upgrade, console is read-only.');
  await dialog.getByLabel(/Read-only/).check();
  await dialog.getByRole('button', { name: 'Post' }).click();
  const banner = page.getByRole('status').filter({ hasText: 'Database upgrade' });
  await expect(banner).toBeVisible();
  await shot(page, 'banner-maintenance', '1440');
  await banner.getByRole('button', { name: 'Resolve' }).click();
  await expect(banner).toHaveCount(0);
});
