/**
 * Publishing place photos against a migrated Postgres: a photo proposed for a place by its source
 * ref is stored under this environment's POI id (the subject the app reads), a ref with no active
 * POI here is dropped, and a photo left with no subject is not stored.
 */
import { randomUUID } from 'node:crypto';

import { buildRelease, type ContentItem } from '@cp/content';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MEDIA_INGEST_QUEUE } from '@cp/domain';

import { ensureQueues, queueSpec } from '../../src/boss/queues';
import { publishRelease } from '../../src/content/publish';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let linhUng: string;
let myKhe: string;
const FSQ = randomUUID().replace(/-/gu, '').slice(0, 24);
const OVERTURE = randomUUID();

beforeAll(async () => {
  harness = await startJobsHarness();
  // Publishing enqueues each asset's ingest; the queue exists but nothing works it here.
  const boss = await harness.startRuntime([]);
  await ensureQueues(boss, [[MEDIA_INGEST_QUEUE, queueSpec(MEDIA_INGEST_QUEUE)]]);
  const { rows } = await harness.pool.query<{ id: string; name: string }>(
    `WITH d AS (
       INSERT INTO destinations (slug, name, coverage, tz)
       VALUES ('da-nang-' || substr(md5(random()::text), 1, 8), 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh')
       RETURNING id
     )
     INSERT INTO pois (destination_id, name, category, lat, lng, source_ids, curation)
     SELECT id, v.name, v.category, v.lat, v.lng, v.source_ids::jsonb, 'editorial'
       FROM d, (VALUES
         ('Chùa Linh Ứng', 'temple_shrine', 16.0998, 108.2777, json_build_object('fsq_os', $1::text)::text),
         ('My Khe Beach', 'beach', 16.0631, 108.2459, json_build_object('overture', $2::text)::text)
       ) AS v(name, category, lat, lng, source_ids)
     RETURNING id, name`,
    [FSQ, OVERTURE],
  );
  linhUng = rows.find((r) => r.name === 'Chùa Linh Ứng')!.id;
  myKhe = rows.find((r) => r.name === 'My Khe Beach')!.id;
}, 120_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

function photo(sourceId: string, subjects: string[], title: string | null): ContentItem<'media'> {
  return {
    id: `wikimedia-photo-${sourceId}`,
    kind: 'photo',
    source: 'wikimedia',
    source_id: sourceId,
    source_url: `https://commons.wikimedia.org/wiki/File:${sourceId}.jpg`,
    download_url: `https://upload.wikimedia.org/${sourceId}.jpg`,
    preview_url: `https://upload.wikimedia.org/${sourceId}.jpg`,
    subjects,
    rank: 0,
    title,
    author: 'Someone',
    author_url: null,
    licence: 'cc-by-sa-4.0',
    licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution_required: true,
    credit: 'Someone · CC BY-SA 4.0 · Wikimedia Commons',
    width: 1920,
    height: 1280,
    duration_ms: null,
  };
}

async function publish(items: readonly ContentItem<'media'>[]): Promise<void> {
  const version = 900 + Math.floor(Math.random() * 99);
  const artifact = buildRelease({
    kind: 'media',
    version,
    items,
    generated_by: {
      batch_key: 'places',
      route: null,
      model: null,
      generated_at: '2026-10-03T00:00:00Z',
    },
    approved_by: randomUUID(),
  });
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at)
     VALUES ('media', $1, $2, $2, 'approved', 'approve', $3, $4, $5, $6, now()) RETURNING id`,
    [
      version,
      `media-places-${randomUUID()}`,
      artifact.checksum,
      JSON.stringify(artifact),
      items.length,
      artifact.approved_by,
    ],
  );
  await withSystem(harness.pool, (tx) => publishRelease(tx, rows[0]!.id));
}

describe('publishing place photos', { timeout: 120_000 }, () => {
  it('stores a place photo under the POI id its source ref names', async () => {
    await publish([
      photo('101', ['destination:da-nang'], 'Da Nang skyline'),
      photo('102', [`poi:fsq-os-${FSQ}`], 'Linh Ứng'),
      photo('103', [`poi:overture-${OVERTURE}`, `poi:fsq-os-${'0'.repeat(24)}`], 'My Khe'),
      photo('104', [`poi:overture-${randomUUID()}`], 'A place this environment lacks'),
    ]);
    const { rows } = await harness.pool.query<{ source_id: string; subject_keys: string[] }>(
      "SELECT source_id, subject_keys FROM media_assets WHERE source = 'wikimedia' ORDER BY source_id",
    );
    expect(rows).toEqual([
      { source_id: '101', subject_keys: ['destination:da-nang'] },
      { source_id: '102', subject_keys: [`poi:${linhUng}`] },
      { source_id: '103', subject_keys: [`poi:${myKhe}`] },
    ]);
  });
});
