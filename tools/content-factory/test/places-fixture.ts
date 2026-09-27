/**
 * A handful of real Bali places shaped the way the POI importer stores them (open-data source ids,
 * no editorial yet), including one place recorded twice under two names 15 m apart.
 */
import type pg from 'pg';

export const FIXTURE_POIS = [
  {
    source: 'fsq_os',
    id: 'fixture-uluwatu',
    name: 'Pura Luhur Uluwatu',
    category: 'temple_shrine',
    lat: -8.82915,
    lng: 115.08492,
  },
  {
    source: 'overture',
    id: 'fixture-uluwatu-en',
    name: 'Uluwatu Temple',
    category: 'temple_shrine',
    lat: -8.82925,
    lng: 115.08502,
  },
  {
    source: 'fsq_os',
    id: 'fixture-tegallalang',
    name: 'Tegallalang Rice Terrace',
    category: 'nature',
    lat: -8.4312,
    lng: 115.2793,
  },
  {
    source: 'fsq_os',
    id: 'fixture-ubud-market',
    name: 'Ubud Art Market',
    category: 'market',
    lat: -8.5069,
    lng: 115.2625,
  },
] as const;

export async function seedFixturePois(pool: pg.Pool): Promise<void> {
  await pool.query(
    `INSERT INTO destinations (slug, name, coverage, tz) VALUES ('bali', 'Bali', 'live', 'Asia/Makassar')
     ON CONFLICT (slug) DO NOTHING`,
  );
  for (const poi of FIXTURE_POIS) {
    await pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids)
       SELECT id, $1, $2, $3, $4, jsonb_build_object($5::text, $6::text) FROM destinations WHERE slug = 'bali'
       ON CONFLICT DO NOTHING`,
      [poi.name, poi.category, poi.lat, poi.lng, poi.source, poi.id],
    );
  }
}
