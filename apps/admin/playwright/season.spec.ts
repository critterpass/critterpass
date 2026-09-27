/**
 * Season review: a content reviewer approves a draft month curve as it is and another after editing
 * a value, approves one researched event and rejects another; each decision leaves its audit row.
 */
import { expect, test } from '@playwright/test';
import pg from 'pg';

import { E2E_DATABASE_URL } from './e2e-env';
import { nav, signInAs } from './session';

async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function auditTargets(action: string): Promise<string[]> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ target_id: string; email: string }>(
      `SELECT a.target_id::text, u.email FROM ops.admin_audit a
         JOIN auth."user" u ON u.id = a.admin_id WHERE a.action = $1`,
      [action],
    );
    expect(rows.every((row) => row.email === 'content@critterpass.test')).toBe(true);
    return rows.map((row) => row.target_id);
  });
}

const destinationId = (slug: string) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM destinations WHERE slug = $1',
      [slug],
    );
    return rows[0]?.id ?? '';
  });

const eventId = (name: string) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM season_events WHERE name = $1',
      [name],
    );
    return rows[0]?.id ?? '';
  });

test('content approves a draft curve, and edits then approves another', async ({ page }) => {
  await signInAs(page, 'content');
  await expect(page.getByRole('link', { name: /Season items to review/ })).not.toContainText('…');
  await nav(page).getByRole('link', { name: 'Season review' }).click();

  const curves = page.getByRole('region', { name: 'Month curves' });
  const lisbon = curves.getByRole('article', { name: 'Lisbon curve' });
  await expect(lisbon.getByText('interpolated').first()).toBeVisible();
  await lisbon.getByRole('button', { name: 'Approve curve' }).click();
  await expect(lisbon).toHaveCount(0);
  const kyotoId = await destinationId('kyoto');
  const lisbonId = await destinationId('lisbon');
  expect(await auditTargets('upsert_season_editorial')).toEqual([lisbonId]);

  await page.getByLabel('Destination').selectOption(kyotoId);
  const kyoto = curves.getByRole('article', { name: 'Kyoto curve' });
  await expect(curves.getByRole('article')).toHaveCount(1);
  await kyoto.getByRole('button', { name: 'Edit values' }).click();
  await kyoto.getByLabel('Feb crowd').fill('150');
  await expect(kyoto.getByRole('button', { name: 'Save and approve' })).toBeDisabled();
  await kyoto.getByLabel('Feb crowd').fill('70');
  await kyoto.getByRole('button', { name: 'Save and approve' }).click();
  await expect(page.getByText('No draft curves')).toBeVisible();

  await page.getByRole('tab', { name: 'approved' }).click();
  await expect(kyoto.getByRole('row', { name: /^Feb/ })).toContainText('70');
  await expect(kyoto).toContainText('approved');
  expect((await auditTargets('upsert_season_editorial')).sort()).toEqual(
    [lisbonId, kyotoId].sort(),
  );
  const stored = await withDb((client) =>
    client.query<{ crowd_index: number; reviewed: boolean }>(
      `SELECT crowd_index, reviewed_at IS NOT NULL AS reviewed FROM season_months
        WHERE destination_id = $1 AND month = 2`,
      [kyotoId],
    ),
  );
  expect(stored.rows).toEqual([{ crowd_index: 70, reviewed: true }]);
});

test('content approves one researched event and rejects another', async ({ page }) => {
  await signInAs(page, 'content');
  await nav(page).getByRole('link', { name: 'Season review' }).click();
  await page.getByLabel('Destination').selectOption(await destinationId('kyoto'));
  const events = page.getByRole('region', { name: 'Researched events' });

  const lights = events.getByRole('listitem', { name: 'Arashiyama Hanatouro' });
  await expect(lights).toContainText('12 Dec 2026 – 21 Dec 2026');
  await expect(lights).toContainText(/Fetched\s*28 Sept? 2026/);
  const source = lights.getByRole('link', { name: 'hanatouro.jp' });
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('href', 'https://www.hanatouro.jp/e/arashiyama/');
  await lights.getByRole('button', { name: 'Approve' }).click();
  await expect(lights).toHaveCount(0);

  const okera = events.getByRole('listitem', { name: 'Okera Mairi at Yasaka Shrine' });
  await okera.getByRole('button', { name: 'Reject' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reject this event' });
  await dialog.getByRole('button', { name: 'Reject event' }).click();
  await expect(okera).toHaveCount(0);

  const approvedId = await eventId('Arashiyama Hanatouro');
  expect(await auditTargets('review_season_event.approve')).toEqual([approvedId]);
  expect(await auditTargets('review_season_event.reject')).toHaveLength(1);
  expect(await eventId('Okera Mairi at Yasaka Shrine')).toBe('');

  await page.getByRole('tab', { name: 'approved' }).click();
  await expect(events.getByRole('listitem', { name: 'Arashiyama Hanatouro' })).toContainText(
    'approved',
  );
});
