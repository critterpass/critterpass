import { expect, test, type Page } from '@playwright/test';

import { nav, signInAs } from './session';

const CLOSED_UID = '01920000-0000-7000-8000-00000000a005';

async function openClosedAccount(page: Page, role: 'owner' | 'support') {
  await signInAs(page, role);
  await nav(page).getByRole('link', { name: 'Account deletions' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account deletions');
  const table = page.getByRole('table', { name: 'Account deletions' });
  await expect(table).toContainText('In grace window');
  await table.getByRole('link', { name: CLOSED_UID }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chloe Closing');
}

test('support sees where a deletion stands but cannot end the grace window', async ({ page }) => {
  await openClosedAccount(page, 'support');
  const deletion = page.getByRole('region', { name: 'Account deletion' });
  await expect(deletion.locator('[aria-current="step"]')).toHaveText('Restore 30 d');
  await expect(deletion).toContainText('can be restored until');
  await expect(deletion).toContainText('No data export asked for.');
  await expect(deletion.getByRole('button', { name: 'Purge now' })).toHaveCount(0);
});

test('an owner ends the grace window with a reason, and the audit log keeps it', async ({
  page,
}) => {
  await openClosedAccount(page, 'owner');
  const deletion = page.getByRole('region', { name: 'Account deletion' });
  await deletion.getByRole('button', { name: 'Purge now' }).click();
  const dialog = page.getByRole('dialog', { name: 'Purge this account now' });
  await expect(dialog).toContainText('cannot be restored');
  await dialog.getByLabel('Reason (kept in the audit log)').fill('Erasure request by post');
  await dialog.getByRole('button').first().click();
  await expect(dialog).toBeHidden();

  await nav(page).getByRole('link', { name: 'Audit log' }).click();
  await expect(page.locator('main')).toContainText('force_purge_account');
});

test('a traveller who never asked to delete shows no deletion', async ({ page }) => {
  await signInAs(page, 'support');
  await nav(page).getByRole('link', { name: 'Support' }).click();
  await page.getByLabel('Find user', { exact: true }).fill('@maitran');
  await page.getByRole('button', { name: 'Find user' }).click();
  await page.getByRole('link', { name: 'Mai Tran' }).click();
  await expect(
    page.getByRole('region', { name: 'Account deletion' }).locator('[aria-current="step"]'),
  ).toHaveText('None');
});
