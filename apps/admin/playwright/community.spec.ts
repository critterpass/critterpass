import { expect, test } from '@playwright/test';

import { nav, signInAs } from './session';

const PLAN = 'Four slow days in Ubud';

test('ops takes a crew plan down with a reason', async ({ page }) => {
  await signInAs(page, 'ops');
  await nav(page).getByRole('link', { name: 'Shared plans' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shared plans');

  const table = page.getByRole('table', { name: 'Crew plans' });
  const row = table.getByRole('row', { name: new RegExp(PLAN) });
  await expect(row).toContainText('Bali');
  await expect(row).toContainText('4 days · crew of 4');
  await expect(row).toContainText('4.5 (6)');

  await row.getByRole('button', { name: 'Take down' }).click();
  const dialog = page.getByRole('dialog', { name: 'Take this plan down' });
  await expect(dialog).toContainText(PLAN);
  await dialog.getByLabel('Reason (kept in the audit log)').fill('Shows a private address');
  await dialog.getByRole('button').first().click();
  await expect(dialog).toBeHidden();
  await expect(table.getByRole('row', { name: new RegExp(PLAN) })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Came down' }).click();
  const down = page.getByRole('table', { name: 'Crew plans' }).getByRole('row', {
    name: new RegExp(PLAN),
  });
  await expect(down).toContainText('Shows a private address');
  await expect(down.getByRole('button')).toHaveCount(0);
});

test('support cannot open shared plans', async ({ page }) => {
  await signInAs(page, 'support');
  await expect(nav(page).getByRole('link', { name: 'Shared plans' })).toHaveCount(0);
  await page.goto('/shared-plans');
  await expect(page.getByText('Not for your role')).toBeVisible();
});
