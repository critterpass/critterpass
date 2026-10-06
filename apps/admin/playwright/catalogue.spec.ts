import { expect, test, type Page } from '@playwright/test';

import { nav, signInAs } from './session';

async function openGuide(page: Page, name: string) {
  await nav(page).getByRole('link', { name: 'Catalogue' }).click();
  await page.getByRole('row', { name: new RegExp(`^${name}\\b`) }).click();
  await expect(page.locator('.card .state-title').first()).toHaveText(name);
}

test('content edits a guide with a diff preview, the colour stays locked', async ({ page }) => {
  await signInAs(page, 'content');
  await openGuide(page, 'Pon');
  await expect(page.getByLabel('Colour (canonical) (locked)')).toBeDisabled();

  await page.getByLabel('Voice id').fill('voice-pon-e2e');
  await expect(page.getByLabel('Changes')).toContainText('voice_id');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('row', { name: /^Pon\b/ })).toContainText('voice-pon-e2e');
  await expect(page.getByLabel('Changes')).toHaveCount(0);
});

test('a concurrent edit shows the server diff and re-applies on the latest', async ({
  page,
  browser,
}) => {
  await signInAs(page, 'content');
  await openGuide(page, 'Ajo');

  const other = await browser.newPage();
  await signInAs(other, 'content');
  await openGuide(other, 'Ajo');
  await other.getByLabel('Name', { exact: true }).fill('Ajo the Axolotl');
  await other.getByRole('button', { name: 'Save' }).click();
  await expect(other.getByRole('row', { name: /^Ajo the Axolotl/ })).toBeVisible();
  await other.close();

  await page.getByLabel('Voice id').fill('voice-ajo-e2e');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.getByText(/content@critterpass\.test saved first at \d{2}:\d{2}/),
  ).toBeVisible();
  await expect(page.getByLabel('Changes')).toContainText('Ajo the Axolotl');

  await page.getByRole('button', { name: 'Load the latest and re-apply' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ajo the Axolotl');
  await expect(page.getByLabel('Voice id')).toHaveValue('voice-ajo-e2e');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /^Ajo the Axolotl/ })).toContainText('voice-ajo-e2e');
});

test('a POI shows its pin preview', async ({ page }) => {
  await signInAs(page, 'content');
  await nav(page).getByRole('link', { name: 'Catalogue' }).click();
  await page.getByRole('tab', { name: 'POIs' }).click();
  await page.getByRole('row', { name: /Tegallalang Rice Terrace/ }).click();
  await expect(page.getByRole('figure', { name: 'Pin preview' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Lat', { exact: true })).toHaveValue('-8.4312');
});
