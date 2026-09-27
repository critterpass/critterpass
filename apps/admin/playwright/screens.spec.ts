/**
 * Review screenshots of the console at desktop and phone widths. Runs only when ADMIN_SHOTS_DIR is
 * set: `ADMIN_SHOTS_DIR=/path pnpm --filter @cp/admin exec playwright test screens.spec.ts`.
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { nav, signInAs } from './session';

const shotsDir = process.env['ADMIN_SHOTS_DIR'];
const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

test.skip(shotsDir === undefined, 'set ADMIN_SHOTS_DIR to capture review screenshots');

async function shot(page: Page, name: string, width: string) {
  await page.screenshot({
    path: path.join(shotsDir ?? '', `${name}-${width}.png`),
    fullPage: true,
  });
}

for (const size of WIDTHS) {
  test(`console at ${size.name}px`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await shot(page, 'sign-in', size.name);

    await signInAs(page, 'support');
    await shot(page, 'shell-support', size.name);
    await page.goto('/flags');
    await expect(page.getByText('Not for your role')).toBeVisible();
    await shot(page, 'forbidden-support', size.name);
    await nav(page).getByRole('button', { name: 'Sign out' }).click();

    await signInAs(page, 'owner');
    await shot(page, 'shell-owner', size.name);

    await nav(page).getByRole('link', { name: 'Catalogue' }).click();
    await page.getByRole('row', { name: /^Pon\b/ }).click();
    await page.getByLabel('Voice id').fill('voice-pon-preview');
    await expect(page.getByLabel('Changes')).toContainText('voice_id');
    await shot(page, 'catalogue-guide', size.name);

    await page.getByRole('tab', { name: 'POIs' }).click();
    await page.getByRole('row', { name: /Tegallalang Rice Terrace/ }).click();
    await expect(page.getByRole('figure', { name: 'Pin preview' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(2500);
    await shot(page, 'catalogue-poi', size.name);

    await nav(page).getByRole('link', { name: 'Flags & config' }).click();
    await page.getByRole('row', { name: /seat\.cap_free/ }).click();
    await page.getByLabel('Value', { exact: true }).fill('7');
    await shot(page, 'flags', size.name);
    await page.getByRole('button', { name: 'Save' }).click();
    await shot(page, 'flags-confirm', size.name);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await nav(page).getByRole('link', { name: 'Partners' }).click();
    await page.getByRole('row', { name: /viator_booking/ }).click();
    await shot(page, 'partners', size.name);
  });
}
