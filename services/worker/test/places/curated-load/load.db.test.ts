/**
 * Loading curated places on a migrated Postgres: a line is written into the note of the open-data
 * row it names (point, name and address untouched; the note's other keys kept), the place becomes
 * reviewed and popular in its rank, a place no row carries is reported and never created, a re-run
 * updates, a place the file drops loses its curated block, and a sparse destination gets the
 * on-demand ingest job instead of a load.
 */
import { popularPlaces, withSystem } from '@cp/db';
import { PLACES_QUEUES, readEditorialOverlay } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadCuratedPlaces } from '../../../src/places/curated-load/load';
import type { CuratedPlaceRow } from '../../../src/places/curated-load/rows';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

let harness: JobsHarness;
let boss: PgBoss;
let seoul: string;
let palace: string;
let market: string;

const line = (over: Partial<CuratedPlaceRow>): CuratedPlaceRow => ({
  destination: 'kr-seoul',
  name_en: 'Gyeongbokgung Palace',
  name_local: '경복궁',
  category: 'temple_shrine',
  lat: 37.5797,
  lng: 126.9771,
  why_go_en: 'The grandest of the five palaces.',
  why_go_vi: 'Cung điện lớn nhất trong năm cung.',
  visit_minutes: 120,
  best_time: 'Weekday mornings',
  busy: 'Crowded at weekends from 11:00.',
  entry_fee: { text: 'Adults 3,000 won', source_url: 'https://royal.example/fee', estimate: false },
  hours: { text: '9:00-18:00', source_url: null, estimate: true },
  tips_en: ['Wear a hanbok and enter free.'],
  tips_vi: ['Mặc hanbok để vào miễn phí.'],
  dress: 'Comfortable shoes.',
  getting_there: 'Gyeongbokgung station, exit 5.',
  sources: ['https://royal.example/fee'],
  ...over,
});

async function poi(destinationId: string, name: string, lat: number, lng: number, extra = {}) {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, address, editorial)
     VALUES ($1, $2, 'museum', $3, $4, 'Open data address', $5) RETURNING id`,
    [destinationId, name, lat, lng, JSON.stringify(extra)],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  boss = await harness.startRuntime([]);
  await boss.createQueue(PLACES_QUEUES.ingest);
  const { rows } = await harness.pool.query<{ id: string; slug: string }>(
    `INSERT INTO destinations (slug, name, country, coverage) VALUES
       ('kr-seoul', 'Seoul', 'South Korea', 'guest'), ('kr-busan', 'Busan', 'South Korea', 'guest')
     RETURNING id, slug`,
  );
  seoul = rows.find((r) => r.slug === 'kr-seoul')!.id;
  palace = await poi(seoul, '경복궁', 37.5796, 126.977, {
    photos: [],
    i18n: { vi: { etiquette: 'Giữ trật tự.' } },
  });
  market = await poi(seoul, 'Gwangjang Market', 37.57, 126.9997);
  // A restaurant of the palace's name across town, and filler so Seoul is not sparse.
  await poi(seoul, '경복궁', 37.5, 127.05);
  await harness.pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     SELECT $1, 'filler ' || n, 'food', 37.4, 127.2 FROM generate_series(1, 60) AS n`,
    [seoul],
  );
}, 240_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

const editorial = async (id: string) =>
  (
    await harness.pool.query<{
      editorial: Record<string, unknown>;
      curation: string;
      name: string;
      lat: number;
    }>('SELECT editorial, curation, name, lat FROM pois WHERE id = $1', [id])
  ).rows[0]!;

describe('loading curated places', () => {
  it('writes each line into its row as reviewed content and makes it popular', async () => {
    const report = await loadCuratedPlaces(
      harness.pool,
      'kr-seoul',
      [
        line({}),
        line({
          name_en: 'Bukchon Hanok Village',
          name_local: '북촌한옥마을',
          lat: 37.5826,
          lng: 126.983,
        }),
        line({
          name_en: 'Gwangjang Market',
          name_local: '광장시장',
          category: 'market',
          lat: 37.5701,
          lng: 126.9996,
        }),
      ],
      { dryRun: false },
    );
    expect(report.status).toBe('loaded');
    expect(report.matched.map((m) => m.poiId)).toEqual([palace, market]);
    expect(report.unmatched).toEqual([{ name: 'Bukchon Hanok Village', closest: null }]);
    const stored = await editorial(palace);
    expect(stored).toMatchObject({ curation: 'editorial', name: '경복궁', lat: 37.5796 });
    const note = readEditorialOverlay(stored.editorial);
    expect(note).toMatchObject({
      why_go: 'The grandest of the five palaces.',
      crowd_hint: 'Crowded at weekends from 11:00.',
      time_needed_min: 120,
      photos: [],
      curated: {
        rank: 1,
        fee: { basis: 'cited' },
        hours: { basis: 'estimate' },
        crowd_basis: 'estimate',
      },
      i18n: { vi: { etiquette: 'Giữ trật tự.', why_go: 'Cung điện lớn nhất trong năm cung.' } },
    });
    const popular = await withSystem(harness.pool, (tx) => popularPlaces(tx, seoul));
    expect(popular.map((p) => p.poiId)).toEqual([palace, market]);
    const { rows } = await harness.pool.query('SELECT 1 FROM pois WHERE name = $1', [
      'Bukchon Hanok Village',
    ]);
    expect(rows).toEqual([]);
  });

  it('updates on a re-run and takes the curated block off a place the file drops', async () => {
    const report = await loadCuratedPlaces(
      harness.pool,
      'kr-seoul',
      [line({ why_go_en: 'Five palaces, and this is the big one.' })],
      { dryRun: false },
    );
    expect(report.dropped).toBe(1);
    expect(readEditorialOverlay((await editorial(palace)).editorial).why_go).toBe(
      'Five palaces, and this is the big one.',
    );
    const kept = readEditorialOverlay((await editorial(market)).editorial);
    expect(kept.curated).toBeUndefined();
    expect(kept.why_go).toBe('The grandest of the five palaces.');
  });

  it('writes nothing on a dry run', async () => {
    const before = await editorial(palace);
    const report = await loadCuratedPlaces(
      harness.pool,
      'kr-seoul',
      [line({ why_go_en: 'Changed' })],
      { dryRun: true },
    );
    expect(report.status).toBe('checked');
    expect((await editorial(palace)).editorial).toEqual(before.editorial);
  });

  it('queues the on-demand ingest for a sparse destination and loads nothing', async () => {
    const report = await loadCuratedPlaces(
      harness.pool,
      'kr-busan',
      [line({ destination: 'kr-busan' })],
      { dryRun: false },
    );
    expect(report.status).toBe('ingest_queued');
    const [job] = await boss.fetch<{ slug: string }>(PLACES_QUEUES.ingest);
    expect(job?.data).toEqual({ slug: 'kr-busan' });
    expect((await loadCuratedPlaces(harness.pool, 'nowhere', [], { dryRun: false })).status).toBe(
      'unknown_destination',
    );
  });
});
