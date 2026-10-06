import { expect, test } from '@playwright/test';

import { nav, signInAs } from './session';

test('ops works the desk: soonest due first, approval card, gate on outbound tasks', async ({
  page,
}) => {
  await signInAs(page, 'ops');
  await expect(page.getByRole('link', { name: /Desk tasks due < 2 h/ })).toContainText('2');
  await nav(page).getByRole('link', { name: 'Concierge desk' }).click();

  const queue = page.getByRole('list', { name: 'desk queue' });
  const items = queue.getByRole('button');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('clinic handoff');
  await expect(items.nth(0)).toContainText('overdue by');
  await expect(items.nth(1)).toContainText('vendor message');
  await expect(items.nth(2)).toContainText('partner booking');

  await items.nth(1).click();
  const approval = page.getByLabel('User approval');
  await expect(approval).toContainText('hold a table for 4 this Friday at 19:30');
  await page.keyboard.press('t');
  await expect(items.nth(1)).toContainText('ops@critterpass.test');
  await page.keyboard.press('s');
  await expect(items).toHaveCount(2);

  await page.getByRole('tab', { name: 'in progress' }).click();
  await queue.getByRole('button', { name: /vendor message/ }).click();
  await page.getByLabel('Add a note').fill('Called the warung, table held.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByLabel('Notes')).toContainText('table held');
  await page.getByRole('button', { name: 'Done (d)' }).click();
  await expect(queue.getByRole('button', { name: /vendor message/ })).toHaveCount(0);

  await page.getByRole('tab', { name: 'new' }).click();
  await queue.getByRole('button', { name: /partner booking/ }).click();
  await expect(page.getByRole('note')).toContainText('Waiting for the user to approve');
  await page.keyboard.press('s');
  await page.getByRole('tab', { name: 'in progress' }).click();
  await queue.getByRole('button', { name: /partner booking/ }).click();
  await page.getByRole('button', { name: 'Done (d)' }).click();
  await expect(page.getByRole('alert')).toContainText('The user has not approved this yet');
});

test('ops opens a task by hand', async ({ page }) => {
  await signInAs(page, 'ops');
  await nav(page).getByRole('link', { name: 'Concierge desk' }).click();
  await page.getByRole('button', { name: 'New task' }).click();
  const form = page.getByRole('region', { name: 'New task' });
  await form.getByLabel('Kind').selectOption('review');
  await form.getByLabel('Due in (hours)').fill('1');
  await form.getByLabel('First note').fill('Double-check the Lombok ferry times.');
  await form.getByRole('button', { name: 'Create task' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('list', { name: 'desk queue' })).toContainText('due in');
});
