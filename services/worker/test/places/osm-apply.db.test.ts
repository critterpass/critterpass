/**
 * OpenStreetMap places into `pois` against real Postgres (Testcontainers): a sight open data lacks
 * is added, OSM hours fill a matched POI that has none and never replace editorial hours, OSM's
 * copy of a business is used only for hours, and a rerun links and adds nothing twice.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { classifyOsmTags } from '@cp/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyOsmPlaces } from '../../src/places/osm-apply';
import type { OsmPlaceRow } from '../../src/places/osm-reader';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let bali: string;
let overtureWaterfall: string;
let editorialTemple: string;

function osm(
  sourceId: string,
  tags: Record<string, string>,
  lat: number,
  lng: number,
): OsmPlaceRow {
  const classification = classifyOsmTags(tags);
  if (classification === null) throw new Error(`fixture ${sourceId} is not read`);
  return {
    sourceId,
    name: tags['name:en'] ?? tags['name']!,
    nameLocal: tags['name:en'] === undefined ? undefined : tags['name'],
    classification,
    lat,
    lng,
    address: undefined,
    openingHours: tags['opening_hours'],
    website: tags['website'],
    phone: tags['phone'],
    wikidata: undefined,
  };
}

const ELEMENTS: readonly OsmPlaceRow[] = [
  // Overture's waterfall, 25 m away under the same name: linked, hours and website filled.
  osm(
    'w100',
    {
      natural: 'waterfall',
      name: 'Air Terjun Tegenungan',
      'name:en': 'Tegenungan Waterfall',
      opening_hours: 'Mo-Su 07:00-18:00',
      website: 'https://tegenungan.example',
    },
    -8.5754,
    115.2898,
  ),
  // The editorial temple: linked, but its researched hours stay.
  osm(
    'n200',
    { amenity: 'place_of_worship', name: 'Pura Tirta Empul', opening_hours: '24/7' },
    -8.4155,
    115.3153,
  ),
  // A viewpoint nobody else has: added, with no hours.
  osm('n300', { tourism: 'viewpoint', name: 'Campuhan Ridge Viewpoint' }, -8.5009, 115.2546),
  // A café open data does not have: dropped, never added from OSM.
  osm(
    'n400',
    { amenity: 'cafe', name: 'Kopi Pagi', opening_hours: 'Mo-Su 07:00-15:00' },
    -8.51,
    115.26,
  ),
];

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  bali = (
    await pool.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('bali', 'Bali', 'live', 'Asia/Makassar') RETURNING id",
    )
  ).rows[0]!.id;
  const insert = `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids, curation, hours, hours_source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`;
  overtureWaterfall = (
    await pool.query<{ id: string }>(insert, [
      bali,
      'Tegenungan Waterfall',
      'nature',
      -8.5756,
      115.2899,
      { overture: 'ov-1' },
      'auto',
      {},
      null,
    ])
  ).rows[0]!.id;
  editorialTemple = (
    await pool.query<{ id: string }>(insert, [
      bali,
      'Pura Tirta Empul',
      'temple_shrine',
      -8.4154,
      115.3152,
      { fsq_os: 'fsq-1' },
      'editorial',
      { weekly: { mo: [{ start: '08:00', end: '17:00' }] } },
      'research',
    ])
  ).rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('applyOsmPlaces', () => {
  it('links, fills, adds sights and drops businesses', async () => {
    expect(await applyOsmPlaces(pool, bali, 'Asia/Makassar', ELEMENTS)).toEqual({
      read: 4,
      inserted: 1,
      linked: 2,
      hoursFilled: 1,
    });

    const { rows } = await pool.query<{
      id: string;
      name: string;
      name_local: string | null;
      category: string;
      source_ids: Record<string, string>;
      hours: unknown;
      hours_source: string | null;
      website: string | null;
      curation: string;
    }>(
      `SELECT id, name, name_local, category, source_ids, hours, hours_source, website, curation
       FROM pois WHERE destination_id = $1 ORDER BY name`,
      [bali],
    );
    expect(rows).toHaveLength(3);
    const byName = new Map(rows.map((row) => [row.name, row]));
    expect(byName.get('Tegenungan Waterfall')).toMatchObject({
      id: overtureWaterfall,
      name_local: 'Air Terjun Tegenungan',
      source_ids: { overture: 'ov-1', osm: 'w100' },
      hours_source: 'osm',
      website: 'https://tegenungan.example',
    });
    expect(
      (byName.get('Tegenungan Waterfall')!.hours as { weekly: Record<string, unknown> }).weekly,
    ).toHaveProperty('su', [{ start: '07:00', end: '18:00' }]);
    expect(byName.get('Pura Tirta Empul')).toMatchObject({
      id: editorialTemple,
      source_ids: { fsq_os: 'fsq-1', osm: 'n200' },
      hours: { weekly: { mo: [{ start: '08:00', end: '17:00' }] } },
      hours_source: 'research',
    });
    expect(byName.get('Campuhan Ridge Viewpoint')).toMatchObject({
      category: 'nature',
      source_ids: { osm: 'n300' },
      hours: {},
      hours_source: null,
      curation: 'auto',
    });
    expect(byName.has('Kopi Pagi')).toBe(false);
  });

  it('adds and links nothing twice on a rerun, and follows a rename of an OSM-only place', async () => {
    const renamed = ELEMENTS.map((element) =>
      element.sourceId === 'n300' ? { ...element, name: 'Campuhan Ridge Walk Viewpoint' } : element,
    );
    expect(await applyOsmPlaces(pool, bali, 'Asia/Makassar', renamed)).toEqual({
      read: 4,
      inserted: 0,
      linked: 0,
      hoursFilled: 0,
    });
    const { rows } = await pool.query<{ name: string }>(
      "SELECT name FROM pois WHERE source_ids->>'osm' = 'n300'",
    );
    expect(rows).toEqual([{ name: 'Campuhan Ridge Walk Viewpoint' }]);
    const { rows: count } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pois WHERE destination_id = $1',
      [bali],
    );
    expect(count).toEqual([{ n: 3 }]);
  });
});
