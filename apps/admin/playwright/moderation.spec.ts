import { expect, test } from '@playwright/test';

import { nav, signInAs } from './session';

test('ops works the moderation queue from the keyboard', async ({ page }) => {
  await signInAs(page, 'ops');
  await expect(page.getByRole('link', { name: /Reports open/ })).toContainText('2');
  await nav(page).getByRole('link', { name: 'Moderation' }).click();

  const queue = page.getByRole('list', { name: 'moderation queue' });
  await expect(queue.getByRole('button')).toHaveCount(2);
  const preview = page.getByLabel('Report preview');
  await queue.getByRole('button', { name: /Spammy Sam/ }).click();
  await expect(preview).toContainText('spam_sam');
  await expect(preview).toContainText('2 traveller(s)');
  await expect(page.getByRole('button', { name: 'Hide (h)' })).toHaveCount(0);

  await page.keyboard.press('a');
  await expect(queue.getByRole('button')).toHaveCount(1);
  await page.getByRole('tab', { name: 'dismissed' }).click();
  await expect(preview).toContainText('approve by ops@critterpass.test');
});

test('banning an author asks first and actions the report', async ({ page }) => {
  await signInAs(page, 'support');
  await nav(page).getByRole('link', { name: 'Moderation' }).click();
  await page.getByRole('button', { name: /Rude Rex/ }).click();
  await page.keyboard.press('b');
  const dialog = page.getByRole('dialog', { name: 'Ban this author' });
  await expect(dialog).toContainText('signed out everywhere');
  await dialog.getByRole('button', { name: 'Ban author' }).click();
  await expect(page.getByText('Nothing waiting')).toBeVisible();
  await page.getByRole('tab', { name: 'actioned' }).click();
  await expect(page.getByLabel('Report preview')).toContainText(
    'ban author by support@critterpass.test',
  );
});
