/**
 * Review screenshots of the cost indices screen at desktop and phone widths, taken before any
 * decision is made. Runs only when ADMIN_SHOTS_DIR is set:
 * `ADMIN_SHOTS_DIR=/path pnpm --filter @cp/admin exec playwright test costs-screens.spec.ts`.
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { signInAs } from './session';

const shotsDir = process.env['ADMIN_SHOTS_DIR'];
const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

test.skip(shotsDir === undefined, 'set ADMIN_SHOTS_DIR to capture review screenshots');

async function shot(page: Page, name: string, width: string, fullPage = true) {
  await page.screenshot({ path: path.join(shotsDir ?? '', `${name}-${width}.png`), fullPage });
}

for (const size of WIDTHS) {
  test(`cost indices at ${size.name}px`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await signInAs(page, 'content');
    await expect(page.getByRole('link', { name: /Cost indices to review/ })).not.toContainText('…');
    await shot(page, 'home-content', size.name, false);

    // Phone width hides the side nav behind MORE; open the page directly.
    await page.goto('/costs');
    await expect(page.getByRole('article').first()).toBeVisible();
    await shot(page, 'costs-pending', size.name, false);

    const destination = page.getByLabel('Destination');
    const kyotoId = await destination.locator('option', { hasText: 'Kyoto' }).getAttribute('value');
    await destination.selectOption(kyotoId ?? '');
    await expect(page.getByRole('article')).toHaveCount(1);
    const ryokan = page.getByRole('listitem', { name: 'ryokan' });
    await ryokan.getByRole('button', { name: 'Edit' }).click();
    await shot(page, 'costs-edit', size.name);
    await ryokan.getByRole('button', { name: 'Discard edits' }).click();

    await page.getByRole('tab', { name: 'approved' }).click();
    await expect(page.getByText('No approved cost indices yet')).toBeVisible();
    await shot(page, 'costs-approved-empty', size.name, false);
  });
}
