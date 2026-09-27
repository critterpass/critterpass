/**
 * Audit viewer. Runs after every other spec (its own project), so it can prove the viewer shows
 * every action the whole e2e run performed: the viewer's ids equal `ops.admin_audit`'s.
 */
import { auditPageSchema } from '@cp/domain';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

import { E2E_DATABASE_URL } from './e2e-env';
import { nav, signInAs } from './session';

async function viewerIds(page: Page): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const response = await page.request.get(
      `/v1/admin/audit?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    expect(response.status()).toBe(200);
    const body = auditPageSchema.parse(await response.json());
    ids.push(...body.items.map((item) => item.id));
    cursor = body.next_cursor;
  } while (cursor !== null);
  return ids;
}

test('the viewer shows every action the e2e run performed', async ({ page }) => {
  await signInAs(page, 'owner');
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM ops.admin_audit');
    const stored = rows.map((row) => row.id).sort();
    expect(stored.length).toBeGreaterThan(10);
    expect((await viewerIds(page)).sort()).toEqual(stored);
  } finally {
    await client.end();
  }
});

test('filters by operator and action, links to the target, exports for owners', async ({
  page,
}) => {
  await signInAs(page, 'owner');
  await nav(page).getByRole('link', { name: 'Audit log' }).click();
  const filters = page.getByRole('form', { name: 'Audit filters' });
  await filters.getByLabel('Operator').selectOption({ label: 'support@critterpass.test' });
  await filters.getByLabel('Action').selectOption('grant_entitlement');
  await filters.getByRole('button', { name: 'Apply' }).click();
  const table = page.getByRole('table', { name: 'Audit entries' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('Outage make-good');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^admin-audit-.*\.csv$/);

  await table.getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mai Tran');
});

test('ops reads the log but cannot export or manage roles', async ({ page }) => {
  await signInAs(page, 'ops');
  await nav(page).getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByRole('table', { name: 'Audit entries' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Operators' })).toHaveCount(0);
  expect((await page.request.get('/v1/admin/audit/export')).status()).toBe(403);
});
