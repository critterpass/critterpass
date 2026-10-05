/**
 * Approving a media batch in the ops console: it changes only the items it states. Everything
 * else that is live stays exactly as it was; a live item re-stated with no subjects is taken
 * down, whatever its other fields say, unless a reviewer rejected that removal.
 */
import { buildRelease, loadRelease, type ContentItem } from '@cp/content';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startJobProducer } from '../../src/jobs/producer';
import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let boss: PgBoss;
let owner: string;
let ownerUid: string;

const GENERIC = 'Generic, not this place: ';
const CAFE = 'poi:fsq-os-4d5cfd269895b1f725f8ea0f';
const BAR = 'poi:overture-6eb596b4-7e24-458a-8b4f-c9514d9a7889';

function photo(sourceId: string, subjects: string[], title: string | null): ContentItem<'media'> {
  return {
    id: `pexels-photo-${sourceId}`,
    kind: 'photo',
    source: 'pexels',
    source_id: sourceId,
    source_url: `https://www.pexels.com/photo/${sourceId}/`,
    download_url: `https://images.pexels.com/photos/${sourceId}/o.jpeg`,
    preview_url: `https://images.pexels.com/photos/${sourceId}/l.jpeg`,
    subjects,
    rank: 0,
    title,
    author: 'Someone',
    author_url: null,
    licence: 'pexels',
    licence_url: 'https://www.pexels.com/license/',
    attribution_required: false,
    credit: 'Photo: Someone · Pexels',
    width: 4000,
    height: 2600,
    duration_ms: null,
  };
}

const hero = photo('1', ['destination:da-nang'], 'Da Nang');
const kyoto = photo('2', ['destination:kyoto'], 'Kyoto');
const coffee = photo('3', [CAFE], `${GENERIC}coffee`);
const monkey = photo('4', [BAR], `${GENERIC}bar counter drinks`);
const shared = photo('5', ['destination:da-nang', BAR], 'Dragon Bridge');
const LIVE = [hero, kyoto, coffee, monkey, shared];

async function insertRelease(
  version: number,
  status: string,
  items: readonly ContentItem<'media'>[],
): Promise<string> {
  const artifact = buildRelease({
    kind: 'media',
    version,
    items,
    generated_by: {
      batch_key: `media-${version}`,
      route: null,
      model: null,
      generated_at: '2026-10-04T00:00:00.000Z',
    },
    approved_by: null,
  });
  const live = status === 'published';
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at)
     VALUES ('media', $1, $2, $2, $3, 'review', $4, $5, $6, $7, $8) RETURNING id`,
    [
      version,
      `2026-10-04-media-0${version}`,
      status,
      artifact.checksum,
      JSON.stringify(artifact),
      items.length,
      live ? ownerUid : null,
      live ? new Date() : null,
    ],
  );
  const id = rows[0]!.id;
  for (const item of items) {
    await harness.pool.query(
      "INSERT INTO ops.content_reviews (release_id, item_ref, severity, report) VALUES ($1, $2, 'pass', '[]')",
      [id, item.id],
    );
  }
  return id;
}

async function approved(batchId: string): Promise<Record<string, string[]>> {
  const response = await app.command(owner, 'approve_content_batch', { batch_id: batchId });
  expect(response.status).toBe(200);
  const { rows } = await harness.pool.query<{ artifact: unknown }>(
    'SELECT artifact FROM content_releases WHERE id = $1',
    [batchId],
  );
  const merged = loadRelease(rows[0]!.artifact, 'media');
  // Only one release of a kind may wait to publish; these tests read the merge alone, so the
  // approved batch leaves the queue and the next one is laid over the same live release.
  await harness.pool.query(
    "UPDATE content_releases SET status = 'blocked', blocked_reason = 'read by the test' WHERE id = $1",
    [batchId],
  );
  return Object.fromEntries(
    merged.items.map((item) => [item.source_id, [item.title ?? '', ...item.subjects]]),
  );
}

beforeAll(async () => {
  harness = await startAdminHarness();
  boss = await startJobProducer({
    connectionString: String(
      (harness.pool.options as { connectionString: string }).connectionString,
    ),
    logger: { error: () => undefined },
  });
  ownerUid = await harness.seedOperator('owner@critterpass.test', ['owner']);
  await insertRelease(1, 'published', LIVE);
  app = harness.app({ areas: harness.areas() });
  owner = await app.signIn('owner@critterpass.test');
}, 240_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await app?.close();
  await harness?.stop();
});

const AS_LIVE = {
  '1': ['Da Nang', 'destination:da-nang'],
  '2': ['Kyoto', 'destination:kyoto'],
  '3': [`${GENERIC}coffee`, CAFE],
  '4': [`${GENERIC}bar counter drinks`, BAR],
  '5': ['Dragon Bridge', 'destination:da-nang', BAR],
};

describe('approving a media batch', () => {
  it("leaves every other destination's place photos and all destination media as they were", async () => {
    const TEMPLE = 'poi:fsq-os-5a5a5a5a5a5a5a5a5a5a5a5a';
    const batch = await insertRelease(2, 'review', [
      photo('8', [TEMPLE], `${GENERIC}matcha green tea`),
      photo('9', [TEMPLE], 'A temple in another city'),
    ]);
    expect(await approved(batch)).toEqual({
      ...AS_LIVE,
      '8': [`${GENERIC}matcha green tea`, TEMPLE],
      '9': ['A temple in another city', TEMPLE],
    });
  });

  it('changes what a live photo shows when the batch re-states it', async () => {
    const batch = await insertRelease(3, 'review', [
      { ...shared, subjects: ['destination:da-nang'] },
    ]);
    expect(await approved(batch)).toEqual({
      ...AS_LIVE,
      '5': ['Dragon Bridge', 'destination:da-nang'],
    });
  });

  it('takes down a live photo re-stated with no subjects, whatever else the item says', async () => {
    const batch = await insertRelease(4, 'review', [
      { ...monkey, subjects: [], title: 'A changed title', credit: 'A changed credit' },
      photo('7', [BAR], `${GENERIC}cocktail bar drinks`),
      // Not live: there is nothing to take down, and nothing is added.
      photo('6', [], 'Never published'),
    ]);
    const { '4': gone, ...rest } = AS_LIVE;
    expect(gone).toBeDefined();
    expect(await approved(batch)).toEqual({
      ...rest,
      '7': [`${GENERIC}cocktail bar drinks`, BAR],
    });
  });

  it('keeps the live photo when a reviewer rejects its removal', async () => {
    const batch = await insertRelease(5, 'review', [
      { ...monkey, subjects: [] },
      { ...coffee, subjects: [] },
    ]);
    const reject = await app.command(owner, 'review_content_item', {
      batch_id: batch,
      item_ref: monkey.id,
      verdict: 'reject',
      notes: 'Keep this one.',
    });
    expect(reject.status).toBe(200);
    const { '3': gone, ...rest } = AS_LIVE;
    expect(gone).toBeDefined();
    expect(await approved(batch)).toEqual(rest);
  });
});
