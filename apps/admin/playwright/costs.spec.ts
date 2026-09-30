/**
 * Cost indices: a content reviewer approves a seeded draft band as it is and edits another before
 * approving it; each decision leaves its audit row and the stored amounts match.
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

interface StoredIndex {
  id: string;
  nightly_minor_low: string;
  nightly_minor_high: string;
  food_pp_day_minor: string;
  reviewed: boolean;
}

const storedIndex = (slug: string, stayType: string) =>
  withDb(async (client) => {
    const { rows } = await client.query<StoredIndex>(
      `SELECT i.id, i.nightly_minor_low, i.nightly_minor_high, i.food_pp_day_minor,
              i.reviewed_at IS NOT NULL AS reviewed
         FROM destination_cost_indices i JOIN destinations d ON d.id = i.destination_id
        WHERE d.slug = $1 AND i.stay_type = $2`,
      [slug, stayType],
    );
    return rows[0];
  });

const auditRow = (targetId: string) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ email: string; detail: Record<string, unknown> }>(
      `SELECT u.email, a.detail FROM ops.admin_audit a JOIN auth."user" u ON u.id = a.admin_id
        WHERE a.action = 'review_cost_index' AND a.target_id = $1`,
      [targetId],
    );
    return rows;
  });

/** Draft bands the seed leaves for review; every seeded destination adds its own. */
const pendingCount = () =>
  withDb(async (client) => {
    const { rows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM destination_cost_indices WHERE reviewed_at IS NULL',
    );
    return rows[0]?.n ?? 0;
  });

test('content approves a draft band as it is, and edits then approves another', async ({
  page,
}) => {
  const pending = await pendingCount();
  expect(pending).toBeGreaterThan(2);
  await signInAs(page, 'content');
  await expect(page.getByRole('link', { name: /Cost indices to review/ })).toContainText(
    String(pending),
  );
  await nav(page).getByRole('link', { name: 'Cost indices' }).click();
  await expect(page.getByRole('tab', { name: `pending · ${pending}` })).toBeVisible();

  const kyotoId = await page
    .getByLabel('Destination')
    .locator('option', { hasText: 'Kyoto' })
    .getAttribute('value');
  await page.getByLabel('Destination').selectOption(kyotoId ?? '');
  const kyoto = page.getByRole('article', { name: 'Kyoto cost indices' });
  await expect(page.getByRole('article')).toHaveCount(1);

  const hotel = kyoto.getByRole('listitem', { name: 'hotel' });
  await expect(hotel).toContainText('$60 – $120');
  await expect(hotel).toContainText('estimate');
  await hotel.getByRole('button', { name: 'Approve' }).click();
  await expect(hotel).toHaveCount(0);
  const approved = await storedIndex('kyoto', 'hotel');
  expect(approved).toMatchObject({ nightly_minor_low: '6000', reviewed: true });
  expect(await auditRow(approved?.id ?? '')).toEqual([
    { email: 'content@critterpass.test', detail: expect.objectContaining({ edited: false }) },
  ]);

  const ryokan = kyoto.getByRole('listitem', { name: 'ryokan' });
  await ryokan.getByRole('button', { name: 'Edit' }).click();
  await ryokan.getByLabel('ryokan stay low').fill('300');
  await expect(ryokan.getByRole('button', { name: 'Save and approve' })).toBeDisabled();
  await expect(ryokan).toContainText('must not be below');
  await ryokan.getByLabel('ryokan stay low').fill('135');
  await ryokan.getByLabel('ryokan food').fill('42.50');
  await ryokan.getByRole('button', { name: 'Save and approve' }).click();
  await expect(ryokan).toHaveCount(0);

  const edited = await storedIndex('kyoto', 'ryokan');
  expect(edited).toMatchObject({
    nightly_minor_low: '13500',
    nightly_minor_high: '25000',
    food_pp_day_minor: '4250',
    reviewed: true,
  });
  expect(await auditRow(edited?.id ?? '')).toEqual([
    {
      email: 'content@critterpass.test',
      detail: expect.objectContaining({
        edited: true,
        before: expect.objectContaining({ nightly_minor_low: 12000, food_pp_day_minor: 4000 }),
        after: expect.objectContaining({ nightly_minor_low: 13500, food_pp_day_minor: 4250 }),
      }),
    },
  ]);

  await page.getByRole('tab', { name: 'approved' }).click();
  const served = page.getByRole('article', { name: 'Kyoto cost indices' });
  await expect(served.getByRole('listitem', { name: 'ryokan' })).toContainText('$135 – $250');
  await expect(served.getByRole('listitem', { name: 'ryokan' })).toContainText('$42.50');
  await expect(page.getByRole('tab', { name: `pending · ${pending - 2}` })).toBeVisible();
});
