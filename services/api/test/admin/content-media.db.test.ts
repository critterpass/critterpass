/**
 * Approving a media batch in the ops console. A batch with place photos carries every place photo
 * it keeps, so approval drops the live place photos it lacks; a batch of destination media alone
 * lays over the live release, as every other kind does.
 */
import { buildRelease, loadRelease, type ContentItem } from '@cp/content';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { liveMediaKept } from '../../src/admin/content/commands';
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
  return rows[0]!.id;
}

async function approved(batchId: string): Promise<Record<string, string[]>> {
  const response = await app.command(owner, 'approve_content_batch', { batch_id: batchId });
  expect(response.status).toBe(200);
  const { rows } = await harness.pool.query<{ artifact: unknown }>(
    'SELECT artifact FROM content_releases WHERE id = $1',
    [batchId],
  );
  const merged = loadRelease(rows[0]!.artifact, 'media');
  return Object.fromEntries(merged.items.map((item) => [item.source_id, [...item.subjects]]));
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

describe('which live media a batch leaves standing', () => {
  it('is all of it under a batch of destination media', () => {
    expect(liveMediaKept(LIVE, [photo('9', ['destination:bali'], 'Bali')])).toEqual(LIVE);
  });

  it('is what a place batch carries, and what is not a place photo', () => {
    const tacos = photo('8', [CAFE], `${GENERIC}tacos`);
    const kept = liveMediaKept(LIVE, [hero, tacos, coffee]);
    expect(kept.map((item) => [item.source_id, item.subjects])).toEqual([
      ['1', ['destination:da-nang']],
      ['2', ['destination:kyoto']],
      ['3', [CAFE]],
      // The bar's old photo is gone; the bridge keeps its destination and loses the bar.
      ['5', ['destination:da-nang']],
    ]);
  });
});

describe('approving a media batch', () => {
  it('lays a batch of destination media over the live release', async () => {
    const batch = await insertRelease(2, 'review', [photo('9', ['destination:bali'], 'Bali')]);
    expect(await approved(batch)).toEqual({
      '1': ['destination:da-nang'],
      '2': ['destination:kyoto'],
      '3': [CAFE],
      '4': [BAR],
      '5': ['destination:da-nang', BAR],
      '9': ['destination:bali'],
    });
  });

  it('drops the live place photos a place batch does not carry', async () => {
    const cocktails = photo('7', [BAR], `${GENERIC}cocktail bar drinks`);
    const batch = await insertRelease(3, 'review', [hero, kyoto, coffee, cocktails]);
    expect(await approved(batch)).toEqual({
      '1': ['destination:da-nang'],
      '2': ['destination:kyoto'],
      '3': [CAFE],
      '5': ['destination:da-nang'],
      '7': [BAR],
    });
  });
});
