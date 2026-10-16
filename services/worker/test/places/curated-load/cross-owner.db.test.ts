/**
 * Curated places whose open-data rows another destination owns, on a migrated Postgres: a row a
 * wider destination filed (a country-wide Iceland holding Reykjavik's church) moves to the curated
 * destination with its note, and its synced card moves with it; a row nearer its owner stays with
 * it (Đà Nẵng's day trip to Hội An resolves to Hội An's row without touching its note), so two
 * destinations never take a row back and forth. A destination whose box sits on the wrong place of
 * its name gets a box around its curated points, and that box is ingested once, before the load.
 */
import { PLACES_QUEUES, readEditorialOverlay } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BOSS_SCHEMA } from '../../../src/boss/boss';
import { PLACES_INGEST_TILE_QUEUE } from '../../../src/jobs/places/ingest-tile';
import { loadCuratedPlaces } from '../../../src/places/curated-load/load';
import type { CuratedPlaceRow } from '../../../src/places/curated-load/rows';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

let harness: JobsHarness;
let boss: PgBoss;
const ids = new Map<string, string>();

const line = (over: Partial<CuratedPlaceRow>): CuratedPlaceRow => ({
  destination: 'is-reykjavik',
  name_en: 'Hallgrímskirkja',
  name_local: 'Hallgrímskirkja',
  category: 'temple_shrine',
  lat: 64.1417,
  lng: -21.9266,
  why_go_en: 'The city from the tower.',
  why_go_vi: 'Ngắm thành phố từ tháp.',
  visit_minutes: 60,
  best_time: 'Mornings',
  busy: 'Busy at noon.',
  entry_fee: { text: 'Tower 1,400 ISK', source_url: null, estimate: true },
  hours: { text: '10:00-17:00', source_url: null, estimate: true },
  tips_en: ['Go up the tower.'],
  tips_vi: ['Lên tháp.'],
  getting_there: 'Walk up Skólavörðustígur.',
  sources: ['https://example.org/hallgrimskirkja'],
  ...over,
});

async function poi(slug: string, name: string, lat: number, lng: number): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, $2, 'museum', $3, $4) RETURNING id`,
    [ids.get(slug), name, lat, lng],
  );
  return rows[0]!.id;
}

/** Enough places that the destination is neither sparse nor thin for one line. */
async function filler(slug: string, lat: number, lng: number): Promise<void> {
  await harness.pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     SELECT $1, 'filler ' || n, 'food', $2, $3 FROM generate_series(1, 60) AS n`,
    [ids.get(slug), lat, lng],
  );
}

const row = async (id: string) =>
  (
    await harness.pool.query<{ slug: string; editorial: unknown; card: string | null }>(
      `SELECT d.slug, p.editorial, c.destination_id::text AS card
         FROM pois p JOIN destinations d ON d.id = p.destination_id
         LEFT JOIN place_cards c ON c.id = p.id
        WHERE p.id = $1`,
      [id],
    )
  ).rows[0]!;

beforeAll(async () => {
  harness = await startJobsHarness();
  boss = await harness.startRuntime([]);
  await boss.createQueue(PLACES_QUEUES.ingest);
  await boss.createQueue(PLACES_INGEST_TILE_QUEUE);
  const { rows } = await harness.pool.query<{ id: string; slug: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, lat, lng, place_bounds) VALUES
       ('is-iceland', 'Iceland', 'Iceland', 'guest', NULL, NULL,
        ST_MakeEnvelope(-24.6, 63.2, -13.4, 66.6, 4326)::geography),
       ('is-reykjavik', 'Reykjavik', 'Iceland', 'guest', 64.1475, -21.935,
        ST_MakeEnvelope(-22.09, 64.08, -21.79, 64.21, 4326)::geography),
       ('vn-da-nang', 'Đà Nẵng', 'Vietnam', 'guest', 16.0694, 108.2097,
        ST_MakeEnvelope(107.95, 15.84, 108.36, 16.21, 4326)::geography),
       ('vn-hoi-an', 'Hội An', 'Vietnam', 'guest', 15.8777, 108.3327,
        ST_MakeEnvelope(108.268, 15.818, 108.396, 15.941, 4326)::geography),
       ('vn-ninh-binh', 'Ninh Bình', 'Vietnam', 'guest', 20.2545, 105.9765,
        ST_MakeEnvelope(108.734, 11.719, 108.844, 11.826, 4326)::geography)
     RETURNING id, slug`,
  );
  for (const r of rows) ids.set(r.slug, r.id);
  await filler('is-reykjavik', 64.15, -21.94);
  await filler('vn-da-nang', 16.06, 108.22);
  await filler('vn-hoi-an', 15.88, 108.33);
}, 240_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

describe('curated places another destination owns', () => {
  it('takes over a row a wider destination filed, with its note and its synced card', async () => {
    const church = await poi('is-iceland', 'Hallgrímskirkja', 64.1417, -21.9267);
    const report = await loadCuratedPlaces(harness.pool, 'is-reykjavik', [line({})], {
      dryRun: false,
    });
    expect(report.matched).toEqual([expect.objectContaining({ poiId: church, hold: 'claim' })]);
    const stored = await row(church);
    expect(stored).toMatchObject({ slug: 'is-reykjavik', card: ids.get('is-reykjavik') });
    expect(readEditorialOverlay(stored.editorial)).toMatchObject({ curated: { rank: 1 } });
  });

  it('leaves a row nearer its owner with it, so neither destination takes it back', async () => {
    const house = await poi('vn-da-nang', 'Tan Ky Old House', 15.8768, 108.3301);
    const tanKy = line({
      destination: 'vn-hoi-an',
      name_en: 'Tan Ky Old House',
      name_local: 'Nhà cổ Tấn Ký',
      category: 'museum',
      lat: 15.8769,
      lng: 108.33,
      why_go_en: 'Two centuries of one merchant family.',
    });
    const hoiAn = await loadCuratedPlaces(harness.pool, 'vn-hoi-an', [tanKy], { dryRun: false });
    expect(hoiAn.matched).toEqual([expect.objectContaining({ poiId: house, hold: 'claim' })]);

    // Đà Nẵng's day trip names the same house: it resolves there and Hội An keeps it.
    const dayTrip = { ...tanKy, destination: 'vn-da-nang', why_go_en: 'A day trip from the city.' };
    const daNang = await loadCuratedPlaces(harness.pool, 'vn-da-nang', [dayTrip], {
      dryRun: false,
    });
    expect(daNang.matched).toEqual([expect.objectContaining({ poiId: house, hold: 'shared' })]);
    const stored = await row(house);
    expect(stored.slug).toBe('vn-hoi-an');
    expect(readEditorialOverlay(stored.editorial).why_go).toBe(
      'Two centuries of one merchant family.',
    );
    const again = await loadCuratedPlaces(harness.pool, 'vn-hoi-an', [tanKy], { dryRun: false });
    expect(again.matched).toEqual([expect.objectContaining({ poiId: house, hold: 'own' })]);
  });
});

describe('a destination boxed on the wrong place of its name', () => {
  const sights: [string, number, number][] = [
    ['Trang An', 20.2547, 105.9002],
    ['Tam Coc', 20.2167, 105.9373],
    ['Bai Dinh Pagoda', 20.2869, 105.9058],
    ['Hoa Lu', 20.2444, 105.9167],
    ['Mua Cave', 20.2301, 105.9282],
    ['Ninh Binh Old Quarter', 20.2506, 105.9745],
  ];
  const lines = sights.map(([name, lat, lng]) =>
    line({ destination: 'vn-ninh-binh', name_en: name, name_local: null, lat, lng }),
  );
  const load = () => loadCuratedPlaces(harness.pool, 'vn-ninh-binh', lines, { dryRun: false });

  it('gets a box around its curated points, ingested once before it loads', async () => {
    expect(await load()).toMatchObject({ status: 'ingest_queued', boxRedrawn: true });
    const { rows } = await harness.pool.query<{ holds: boolean }>(
      `SELECT ST_Intersects(place_bounds, ST_MakePoint(105.9373, 20.2167)::geography) AS holds
         FROM destinations WHERE slug = 'vn-ninh-binh'`,
    );
    expect(rows[0]?.holds).toBe(true);
    const [job] = await boss.fetch<{ slug: string }>(PLACES_QUEUES.ingest);
    expect(job?.data).toEqual({ slug: 'vn-ninh-binh' });
    const { rows: keys } = await harness.pool.query<{ key: string }>(
      `SELECT singleton_key AS key FROM ${BOSS_SCHEMA}.job WHERE id = $1`,
      [job!.id],
    );
    expect(keys[0]?.key).toMatch(/^on-demand-ingest:vn-ninh-binh:105\.\d{3},20\.\d{3},/);
    expect((await load()).status).toBe('ingest_running');
    await boss.complete(PLACES_QUEUES.ingest, job!.id);
    // The run's last stage, as the tile queue records it.
    await boss.send(PLACES_INGEST_TILE_QUEUE, {
      slug: 'vn-ninh-binh',
      runId: job!.id,
      stage: 'finish',
    });
    const [finish] = await boss.fetch(PLACES_INGEST_TILE_QUEUE);
    await boss.complete(PLACES_INGEST_TILE_QUEUE, finish!.id, { activeCount: 0 });

    // The box's ingest found nothing: the next pass loads, and queues no ingest again.
    const report = await load();
    expect(report).toMatchObject({ status: 'loaded', boxRedrawn: false, sparse: true });
    expect(await boss.fetch(PLACES_QUEUES.ingest)).toEqual([]);
  });
});
