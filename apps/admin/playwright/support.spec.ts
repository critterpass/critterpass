import { expect, test, type Page } from '@playwright/test';

import { nav, signInAs } from './session';

async function openMai(page: Page, q: string) {
  await signInAs(page, 'support');
  await nav(page).getByRole('link', { name: 'Support' }).click();
  await page.getByLabel('Find user', { exact: true }).fill(q);
  await page.getByRole('button', { name: 'Find user' }).click();
  await page.getByRole('link', { name: 'Mai Tran' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mai Tran');
}

async function confirm(page: Page, title: string, reason: string, until?: string) {
  const dialog = page.getByRole('dialog', { name: title });
  await dialog.getByLabel('Reason (kept in the audit log)').fill(reason);
  if (until !== undefined) await dialog.getByLabel(/^Until/).fill(until);
  await dialog.getByRole('button').first().click();
  await expect(dialog).toBeHidden();
}

test('finds a traveller by phone and join code, never showing contact details', async ({
  page,
}) => {
  await openMai(page, '+84901234567');
  const account = page.getByRole('region', { name: 'Account' });
  await expect(account).toContainText('phone on file');
  await expect(page.locator('main')).not.toContainText('+84901234567');
  await expect(page.locator('main')).not.toContainText('mai@traveller.test');
  await page.getByRole('link', { name: 'Back to search' }).click();
  await page.getByLabel('Find user', { exact: true }).fill('mq7r2k');
  await page.getByRole('button', { name: 'Find user' }).click();
  await expect(page.getByRole('table', { name: 'Matching users' })).toContainText('join code');
});

test('grants and revokes Pass+, revokes a session and bans with a reason', async ({ page }) => {
  await openMai(page, '@maitran');
  const entitlements = page.getByRole('region', { name: 'Entitlements' });
  await expect(entitlements).toContainText('free');
  await entitlements.getByRole('button', { name: 'Grant Pass+' }).click();
  const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await confirm(page, 'Grant Pass+', 'Outage make-good', nextMonth);
  await expect(entitlements).toContainText('active');
  await expect(entitlements).toContainText('by support@critterpass.test');
  await entitlements.getByRole('button', { name: 'Revoke grant' }).click();
  await confirm(page, 'Revoke the Pass+ grant', 'Granted in error');
  await expect(entitlements).toContainText('free');

  const sessions = page.getByRole('region', { name: 'Sessions' });
  await expect(sessions).toContainText('CritterPass/1.4.0');
  await sessions.getByRole('button', { name: 'Revoke' }).click();
  await confirm(page, 'Revoke this session', 'Lost phone');
  await expect(sessions).toContainText('No live sessions');

  await page
    .getByRole('region', { name: 'Devices' })
    .getByRole('button', { name: 'Revoke keys' })
    .click();
  await confirm(page, 'Revoke device action keys', 'Device stolen');

  const account = page.getByRole('region', { name: 'Account' });
  await account.getByRole('button', { name: 'Ban' }).click();
  await confirm(page, 'Ban this account', 'Scam links');
  await expect(account).toContainText('banned');
  await account.getByRole('button', { name: 'Unban' }).click();
  await confirm(page, 'Unban this account', 'Appeal upheld');
  await expect(account.getByRole('button', { name: 'Ban' })).toBeVisible();

  const commands = page.getByRole('region', { name: 'Commands' });
  await expect(commands).toBeVisible();
});

test('ops cannot open support', async ({ page }) => {
  await signInAs(page, 'ops');
  await expect(nav(page).getByRole('link', { name: 'Support' })).toHaveCount(0);
  await page.goto('/support');
  await expect(page.getByText('Not for your role')).toBeVisible();
});
