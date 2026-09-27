import { expect, test } from '@playwright/test';

import { nav, signInAs } from './session';

test('a critical key needs the typed confirm and reaches the app projection', async ({ page }) => {
  await signInAs(page, 'ops');
  await nav(page).getByRole('link', { name: 'Flags & config' }).click();
  const row = page.getByRole('row', { name: /guide\.free_daily_limit/ });
  await expect(row).toContainText('30');
  await row.click();

  await page.getByLabel('Value', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Save' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change a critical setting' });
  await expect(dialog.getByRole('button', { name: 'Change it' })).toBeDisabled();
  await dialog.getByLabel('Confirmation text').fill('guide.free_daily_limit');
  await dialog.getByRole('button', { name: 'Change it' }).click();

  await expect(row.locator('td').nth(1)).toHaveText('25');
  await expect(row.locator('td').nth(3)).toHaveText('25');
  await expect(row).toContainText('ops@critterpass.test');
});

test('a scoped audience stays out of the app projection', async ({ page }) => {
  await signInAs(page, 'ops');
  await nav(page).getByRole('link', { name: 'Flags & config' }).click();
  const row = page.getByRole('row', { name: /perks\.catalogue_version/ });
  await row.click();
  await page.getByLabel('Value', { exact: true }).fill('beta-2');
  await page.getByLabel('Audience').selectOption('cohort');
  await page.getByLabel('Cohort name').fill('beta');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(row).toContainText('Cohort beta');
  await expect(row.locator('td').nth(3)).toHaveText('null');
});

test('enabling a partner flips its app copy flag', async ({ page }) => {
  await signInAs(page, 'ops');
  await nav(page).getByRole('link', { name: 'Partners' }).click();
  await page.getByRole('row', { name: /klook_activity/ }).click();
  await page.getByLabel('Adapter live').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Update adapter and app copy' }).click();
  await expect(page.getByRole('row', { name: /klook_activity/ })).toContainText('live');

  await nav(page).getByRole('link', { name: 'Flags & config' }).click();
  const flag = page.getByRole('row', { name: /supplier\.klook_activity\.enabled/ });
  await expect(flag.locator('td').nth(3)).toHaveText('true');
});
