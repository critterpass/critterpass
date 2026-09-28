/**
 * Content batches: a reviewer marks items and cannot approve; the owner signs off the IP checklist
 * and approves, which queues the release for publishing. Seeds its own batches into the e2e
 * database. With ADMIN_SHOTS_DIR set it also captures review screenshots at 1440 and 390 wide.
 */
import path from 'node:path';

import { buildRelease, currentRelease, type ContentItem, type ContentKind } from '@cp/content';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

import { E2E_DATABASE_URL } from './e2e-env';
import { nav, signInAs } from './session';

const shotsDir = process.env['ADMIN_SHOTS_DIR'];
const at = '2026-09-28T00:00:00.000Z';

async function seedBatch<K extends ContentKind>(
  client: pg.Client,
  kind: K,
  version: number,
  title: string,
  status: string,
  items: readonly ContentItem<K>[],
  extra: {
    gate?: string;
    blocked_reason?: string;
    ip_status?: string;
    notes?: string;
    warn?: readonly (string | undefined)[];
  } = {},
): Promise<void> {
  const artifact = buildRelease({
    kind,
    version,
    items,
    generated_by: {
      batch_key: `e2e-${kind}-${version}`,
      route: 'content.factory',
      model: 'deepseek-v4-pro',
      generated_at: at,
    },
    approved_by: null,
  });
  const live = status === 'published';
  const owner = live
    ? (
        await client.query<{ id: string }>(
          'SELECT id FROM auth."user" WHERE email = \'owner@critterpass.test\'',
        )
      ).rows[0]?.id
    : null;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, gate, blocked_reason, ip_status,
       checksum, artifact, item_count, notes, approved_by, approved_at, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15) RETURNING id`,
    [
      kind,
      version,
      `2026-09-28-${kind}-e2e-${version}`,
      title,
      status,
      live ? 'publish' : 'review',
      extra.gate ?? null,
      extra.blocked_reason ?? null,
      extra.ip_status ?? 'not_applicable',
      artifact.checksum,
      JSON.stringify(artifact),
      items.length,
      extra.notes ?? null,
      owner ?? null,
      live ? new Date() : null,
    ],
  );
  const release = rows[0]!.id;
  for (const [index, ref] of artifact.items
    .map((item) => (item as { id?: string; code?: string }).id ?? (item as { code: string }).code)
    .entries()) {
    const warn = extra.warn?.[index];
    await client.query(
      'INSERT INTO ops.content_reviews (release_id, item_ref, severity, report) VALUES ($1, $2, $3, $4)',
      [
        release,
        ref,
        warn === undefined ? 'pass' : 'warn',
        JSON.stringify(
          warn === undefined ? [] : [{ id: 'contrast', severity: 'warn', message: warn }],
        ),
      ],
    );
  }
}

test.beforeAll(async () => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "DELETE FROM ops.content_reviews WHERE release_id IN (SELECT id FROM content_releases WHERE batch_key LIKE '%-e2e-%')",
    );
    await client.query("DELETE FROM content_releases WHERE batch_key LIKE '%-e2e-%'");
    const forms = currentRelease('forms')!.items;
    const windows = currentRelease('windows')!.items;
    await seedBatch(client, 'windows', 1, 'Designed windows', 'published', windows);
    await seedBatch(client, 'forms', 1, 'Designed forms', 'published', forms.slice(0, 2));
    await seedBatch(client, 'forms', 2, 'Bali and Kyoto', 'review', forms, {
      gate: 'contact_sheets',
      ip_status: 'open',
      warn: [undefined, 'Epic edge on dark is 3.4:1; the glyph needs 4.5:1 at 24 pt'],
    });
    await seedBatch(
      client,
      'phrases',
      1,
      'Indonesian',
      'blocked',
      [
        {
          id: 'id:emergency:need-a-doctor',
          language: 'id',
          context: 'emergency',
          slug: 'need-a-doctor',
          text: 'Saya butuh dokter.',
          romanisation: null,
          gloss: 'I need a doctor.',
          audio_key: null,
          audio_status: 'pending',
          needs_native_review: true,
          native_reviewed_on: null,
        },
      ],
      {
        gate: 'native_review',
        blocked_reason: '1 emergency or allergy card needs a native speaker',
      },
    );
  } finally {
    await client.end();
  }
});

async function openBatch(page: Page, name: RegExp) {
  await nav(page).getByRole('link', { name: 'Content batches' }).click();
  await page.getByRole('navigation', { name: 'Batches' }).getByRole('button', { name }).click();
}

async function shot(page: Page, name: string) {
  if (shotsDir === undefined) return;
  for (const [label, width, height] of [
    ['1440', 1440, 900],
    ['390', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shotsDir, `${name}-${label}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('a reviewer marks items, cannot approve, and sees blocked batches with their reason', async ({
  page,
}) => {
  await signInAs(page, 'content');
  await openBatch(page, /forms · Bali and Kyoto/i);
  const items = page.getByRole('list', { name: 'Batch items' });
  await expect(items.getByRole('button')).toHaveCount(4);
  await items.getByRole('button', { name: /Epic Tokek/ }).click();
  const review = page.getByRole('complementary', { name: 'Item review' });
  await expect(review.getByRole('list', { name: 'Validator report' })).toContainText('3.4:1');
  await expect(review.getByRole('img', { name: 'Epic Tokek' }).first()).toBeVisible();
  await shot(page, 'content-batch-review');

  await review.getByLabel('Note for the regenerate run').fill('Keep the sunrise wording.');
  await review.getByRole('button', { name: 'Reject item' }).click();
  await expect(items.getByLabel('verdict reject')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Approve & publish v2/ })).toBeDisabled();

  await openBatch(page, /phrases · Indonesian/i);
  await expect(page.getByRole('status').filter({ hasText: 'Blocked' })).toContainText(
    'native speaker',
  );
  await shot(page, 'content-batch-blocked');
});

test('the owner signs off the IP checklist and approves', async ({ page }) => {
  await signInAs(page, 'owner');
  await openBatch(page, /forms · Bali and Kyoto/i);
  await page.getByRole('button', { name: /Approve & publish v2/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish forms v2' });
  await expect(dialog.getByRole('button', { name: 'Approve and publish' })).toBeDisabled();
  await dialog.getByLabel(/IP and trademark checklist/).check();
  await shot(page, 'content-batch-approve');
  await dialog.getByRole('button', { name: 'Approve and publish' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Batches' })
      .getByRole('button', { name: /forms · Bali and Kyoto/i }),
  ).toContainText('approved');
});

test('content verifies researched opening hours, which then reach the POI', async ({ page }) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query("DELETE FROM poi_hours_proposals WHERE batch_key = 'e2e-hours'");
    await client.query(
      `INSERT INTO poi_hours_proposals (poi_id, hours, source_url, fetched_at, batch_key)
       SELECT id, $1, 'https://tegallalangriceterrace.org/hours-and-fees', now(), 'e2e-hours'
       FROM pois WHERE name = 'Tegallalang Rice Terrace' LIMIT 1`,
      [
        JSON.stringify({
          weekly: Object.fromEntries(
            ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [
              d,
              [{ start: '07:00', end: '18:00' }],
            ]),
          ),
        }),
      ],
    );
  } finally {
    await client.end();
  }
  await signInAs(page, 'content');
  await nav(page).getByRole('link', { name: 'Content batches' }).click();
  await page.getByRole('link', { name: 'Opening hours' }).click();
  const card = page.getByRole('article', { name: 'Hours for Tegallalang Rice Terrace' });
  await expect(card).toContainText('07:00–18:00');
  await expect(card.getByRole('link', { name: 'tegallalangriceterrace.org' })).toBeVisible();
  await shot(page, 'content-hours');
  await card.getByRole('button', { name: 'Verify hours' }).click();
  await expect(card).toHaveCount(0);
  const check = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await check.connect();
  try {
    const { rows } = await check.query<{ verified: boolean }>(
      "SELECT hours_verified_at IS NOT NULL AS verified FROM pois WHERE name = 'Tegallalang Rice Terrace'",
    );
    expect(rows[0]?.verified).toBe(true);
  } finally {
    await check.end();
  }
});
