/**
 * A curated place found in OpenStreetMap, written on a migrated Postgres (Testcontainers): the new
 * row carries the OSM id, name, local name, point, address and the destination's time zone, plus
 * the curated note; a re-run matches that row without asking OSM; a row of the same OSM id is
 * reused, and one another destination owns is left alone. Nominatim is the recorded-format reply
 * in `fixtures/nominatim/` (see `osm-lookup.test.ts`).
 */
import { readFileSync } from 'node:fs';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { readEditorialOverlay } from '@cp/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { NominatimResult } from '../../../src/places/curated-load/osm-lookup';
import { lookUpCuratedPlace } from '../../../src/places/curated-load/osm-place';
import type { CuratedPlaceRow } from '../../../src/places/curated-load/rows';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let phuket: string;

const patongReply = JSON.parse(
  readFileSync(new URL('../fixtures/nominatim/patong-beach.json', import.meta.url), 'utf8'),
) as NominatimResult[];
let asked = 0;
const search = () => {
  asked += 1;
  return Promise.resolve(patongReply);
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
    await pool.query(`UPDATE pois SET status = 'hidden' WHERE source_ids->>'osm' = 'w151234567'`);
    const reused = await lookUpCuratedPlace(pool, { rank: 3, place: place() }, search);
    expect(reused).toMatchObject({ outcome: 'reused', poi_id: (await stored())[0]!.id });
    const elsewhere = await lookUpCuratedPlace(
      pool,
      { rank: 1, place: place({ destination: 'th-kathu' }) },
      search,
    );
    expect(elsewhere).toMatchObject({ outcome: 'owned_elsewhere', poi_id: null });
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ address: 'Thawewong Road, Patong, Kathu District' });
    const count = await pool.query('SELECT 1 FROM pois WHERE destination_id <> $1', [phuket]);
    expect(count.rows).toEqual([]);
  });
});
