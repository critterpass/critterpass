/**
 * A curated place found in OpenStreetMap, written on a migrated Postgres (Testcontainers): the new
 * row carries the OSM id, name, local name, point, address and the destination's time zone, plus
 * the curated note; a re-run matches that row without asking OSM; a row of the same OSM id is
 * reused, and one another destination owns, or one we hid, is left alone; one another curated
 * place holds keeps its note, and a reused row whose name is not the place's takes OSM's name and
 * category.
 * Nominatim answers with the jsonv2 reply kept in `@cp/planner`'s test fixture.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { readEditorialOverlay } from '@cp/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PATONG_BEACH_REPLY } from '../../../../../packages/planner/test/draft/nominatim-fixture';
import { lookUpCuratedPlace } from '../../../src/places/curated-load/osm-place';
import type { CuratedPlaceRow } from '../../../src/places/curated-load/rows';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let phuket: string;

let asked = 0;
const search = () => {
  asked += 1;
  return Promise.resolve(PATONG_BEACH_REPLY);
};

const place = (over: Partial<CuratedPlaceRow> = {}): CuratedPlaceRow => ({
  destination: 'th-phuket',
  name_en: 'Patong Beach',
  name_local: 'หาดป่าตอง',
  category: 'beach',
  subtype: 'resort beach',
  lat: 7.8961,
  lng: 98.2963,
  why_go_en: 'The busiest beach on the island.',
  why_go_vi: 'Bãi biển đông nhất đảo.',
  visit_minutes: 180,
  best_time: 'Mornings',
  busy: 'Busy from noon.',
  entry_fee: { text: 'Free', source_url: null, estimate: true },
  hours: { text: 'Always open', source_url: null, estimate: true },
  tips_en: ['Bring shade.'],
  tips_vi: ['Mang ô che.'],
  getting_there: 'Songthaew from Phuket Town.',
  sources: ['https://example.org/patong'],
  ...over,
});

const stored = async () =>
  (
    await pool.query<{
      id: string;
      name: string;
      name_local: string | null;
      category: string;
      lat: number;
      lng: number;
      address: string | null;
      timezone: string | null;
      curation: string;
      editorial: unknown;
    }>(
      `SELECT id, name, name_local, category, lat, lng, address, timezone, curation, editorial
         FROM pois WHERE source_ids->>'osm' = 'w151234567'`,
    )
  ).rows;

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: string; slug: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz) VALUES
       ('th-phuket', 'Phuket', 'Thailand', 'guest', 'Asia/Bangkok'),
       ('th-kathu', 'Kathu', 'Thailand', 'guest', 'Asia/Bangkok')
     RETURNING id, slug`,
  );
  phuket = rows.find((row) => row.slug === 'th-phuket')!.id;
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('adding a curated place from OpenStreetMap', () => {
  it('inserts the OSM place with its open-data fields and attaches the curated note', async () => {
    const outcome = await lookUpCuratedPlace(pool, { rank: 3, place: place() }, search);
    expect(outcome).toMatchObject({ outcome: 'inserted', osm: 'w151234567' });
    const [row, ...more] = await stored();
    expect(more).toEqual([]);
    expect(row).toMatchObject({
      name: 'Patong Beach',
      name_local: 'หาดป่าตอง',
      category: 'beach',
      lat: 7.8935,
      lng: 98.2955,
      address: 'Thawewong Road, Patong, Kathu District',
      timezone: 'Asia/Bangkok',
      curation: 'editorial',
    });
    expect(readEditorialOverlay(row!.editorial)).toMatchObject({
      why_go: 'The busiest beach on the island.',
      curated: { rank: 3 },
    });
  });

  it('matches the added row on a re-run without asking OpenStreetMap again', async () => {
    const before = asked;
    const outcome = await lookUpCuratedPlace(pool, { rank: 3, place: place() }, search);
    expect(outcome).toMatchObject({ outcome: 'matched', row: 'Patong Beach' });
    expect(asked).toBe(before);
    expect(await stored()).toHaveLength(1);
  });

  it('reuses the row of the same OSM id and leaves another destination its own', async () => {
    // A name no row match reads, so only the OSM id finds the row.
    await pool.query(
      `UPDATE pois SET name = 'Beach Road Car Park', name_local = NULL
        WHERE source_ids->>'osm' = 'w151234567'`,
    );
    const elsewhere = await lookUpCuratedPlace(
      pool,
      { rank: 1, place: place({ destination: 'th-kathu' }) },
      search,
    );
    expect(elsewhere).toMatchObject({ outcome: 'owned_elsewhere', poi_id: null });
    const reused = await lookUpCuratedPlace(pool, { rank: 3, place: place() }, search);
    expect(reused).toMatchObject({ outcome: 'reused', poi_id: (await stored())[0]!.id });
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ address: 'Thawewong Road, Patong, Kathu District' });
    const count = await pool.query('SELECT 1 FROM pois WHERE destination_id <> $1', [phuket]);
    expect(count.rows).toEqual([]);
  });

  it('leaves a row another curated place holds with its note', async () => {
    await pool.query(
      `UPDATE pois SET editorial = jsonb_set(editorial, '{curated,rank}', '5')
        WHERE source_ids->>'osm' = 'w151234567'`,
    );
    const held = await lookUpCuratedPlace(pool, { rank: 3, place: place() }, search);
    expect(held).toMatchObject({ outcome: 'held', poi_id: (await stored())[0]!.id });
    expect(readEditorialOverlay((await stored())[0]!.editorial)).toMatchObject({
      curated: { rank: 5 },
    });
  });

  it("gives a reused row that does not carry the place's name OSM's name and kind", async () => {
    await pool.query(
      `UPDATE pois SET name = 'Songkran Water Fight', name_local = NULL, category = 'food',
              editorial = editorial - 'curated'
        WHERE source_ids->>'osm' = 'w151234567'`,
    );
    const reused = await lookUpCuratedPlace(pool, { rank: 3, place: place() }, search);
    expect(reused).toMatchObject({ outcome: 'reused' });
    const [row] = await stored();
    expect(row).toMatchObject({ name: 'Patong Beach', name_local: 'หาดป่าตอง', category: 'beach' });
    expect(readEditorialOverlay(row!.editorial)).toMatchObject({ curated: { rank: 3 } });
  });

  it('never brings back or writes a note on a row we hid', async () => {
    await pool.query(
      `UPDATE pois SET status = 'hidden', editorial = editorial - 'curated'
        WHERE source_ids->>'osm' = 'w151234567'`,
    );
    const hidden = await lookUpCuratedPlace(pool, { rank: 3, place: place() }, search);
    expect(hidden).toMatchObject({ outcome: 'owned_elsewhere', poi_id: null });
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(readEditorialOverlay(rows[0]!.editorial)?.curated).toBeUndefined();
  });
});
