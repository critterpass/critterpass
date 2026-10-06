/**
 * Review screenshots of season review at desktop and phone widths, taken before any decision is
 * made. Runs only when ADMIN_SHOTS_DIR is set:
 * `ADMIN_SHOTS_DIR=/path pnpm --filter @cp/admin exec playwright test season-screens.spec.ts`.
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
  test(`season review at ${size.name}px`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await signInAs(page, 'content');
    await expect(page.getByRole('link', { name: /Season items to review/ })).not.toContainText('…');
    await shot(page, 'home-content', size.name);

    // Phone width hides the side nav behind MORE; open the page directly.
    await page.goto('/season');
    const curves = page.getByRole('region', { name: 'Month curves' });
    await expect(curves.getByRole('article').first()).toBeVisible();
    await shot(page, 'season-pending', size.name, false);

    const destination = page.getByLabel('Destination');
    const kyotoId = await destination.locator('option', { hasText: 'Kyoto' }).getAttribute('value');
    await destination.selectOption(kyotoId ?? '');
    await expect(curves.getByRole('article')).toHaveCount(1);
    const kyoto = curves.getByRole('article', { name: 'Kyoto curve' });
    await kyoto.getByRole('button', { name: 'Edit values' }).click();
    await shot(page, 'season-curve-edit', size.name);
    await kyoto.getByRole('button', { name: 'Discard edits' }).click();

    const events = page.getByRole('region', { name: 'Researched events' });
    await events.scrollIntoViewIfNeeded();
    await shot(page, 'season-events', size.name, false);
    await events.getByRole('button', { name: 'Reject' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Reject this event' })).toBeVisible();
    await shot(page, 'season-reject-confirm', size.name, false);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('tab', { name: 'approved' }).click();
    await expect(page.getByText('No approved curves yet')).toBeVisible();
    await shot(page, 'season-approved-empty', size.name);
  });
}
