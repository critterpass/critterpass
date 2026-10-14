/**
 * The lean place index as SQL against real Postgres: the kept set finds a place through every kind
 * of reference (a foreign key, a plain id column, a jsonb list, a media subject key, a merged
 * duplicate) and not through the place's own shadows; it refuses a role that row security
 * filters; and the lean rule reads stored rows as ingest would write them.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { leanPlaceSql, loadKeptPoiIds } from '../../src/places/kept-places';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let destinationId: string;

interface PlaceInput {
  readonly name: string;
  readonly category?: string;
  readonly sources?: Record<string, string>;
  readonly confidence?: number | null;
}

async function place(input: PlaceInput): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids, confidence)
     VALUES ($1, $2, $3, 11.94, 108.44, $4, $5) RETURNING id`,
    [
      destinationId,
      input.name,
      input.category ?? 'food',
      JSON.stringify(input.sources ?? { overture: randomUUID() }),
      input.confidence === undefined ? 0.9 : input.confidence,
    ],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('kept-da-lat', 'Đà Lạt', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  destinationId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await db?.drop();
  await container?.stop();
});

describe('the kept set', () => {
  it('keeps a place for every kind of reference and none for its own shadows', async () => {
    const profiled = await place({ name: 'Profiled' });
    await db.pool.query("INSERT INTO place_profiles (poi_id, status) VALUES ($1, 'pending')", [
      profiled,
    ]);

    const saved = await place({ name: 'Saved' });
    const user = randomUUID();
    await db.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [user]);
    await db.pool.query(
      "INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'place', $2)",
      [user, saved],
    );

    const essential = await place({ name: 'Essential' });
    await db.pool.query(
      `INSERT INTO destination_briefs (destination_id, status, essentials)
       VALUES ($1, 'ready', $2)`,
      [destinationId, JSON.stringify([{ poi_id: essential, rank: 1, why: {}, sources: [] }])],
    );

    const pictured = await place({ name: 'Pictured' });
    await db.pool.query(
      `INSERT INTO media_assets (kind, source, source_id, source_url, download_url, subject_keys,
         author, licence, licence_url, attribution_required, credit)
       VALUES ('photo', 'pexels', 'kept-1', 'https://www.pexels.com/photo/1/',
         'https://images.pexels.com/1.jpeg', $1, 'Someone', 'pexels',
         'https://www.pexels.com/license/', false, 'Photo: Someone · Pexels')`,
      [[`poi:${pictured}`]],
    );

    const mergedInto = await place({ name: 'Merged into' });
    await db.pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, merged_into_id)
       VALUES ($1, 'Duplicate', 'food', 11.94, 108.44, $2)`,
      [destinationId, mergedInto],
    );

    const checked = await place({ name: 'Live-checked only' });
    await db.pool.query('INSERT INTO poi_live_checks (poi_id) VALUES ($1)', [checked]);
    const plain = await place({ name: 'Nothing points here' });

    const kept = await loadKeptPoiIds(db.pool);
    for (const id of [profiled, saved, essential, pictured, mergedInto]) {
      expect(kept.ids.has(id)).toBe(true);
    }
    expect(kept.ids.has(checked)).toBe(false);
    expect(kept.ids.has(plain)).toBe(false);
    expect(Object.keys(kept.byColumn)).toEqual(
      expect.arrayContaining([
        'public.place_profiles.poi_id',
        'public.saved_items.ref_id',
        'public.destination_briefs.essentials',
        'public.media_assets.subject_keys',
        'public.pois.merged_into_id',
      ]),
    );
    expect(Object.keys(kept.byColumn)).not.toContain('public.poi_live_checks.poi_id');
  });

  it('refuses a role that row security filters', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE app_system');
      await expect(loadKeptPoiIds(client)).rejects.toThrow(/bypasses row security/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('the lean rule on stored rows', () => {
  it('passes travel kinds above the floor, hubs, OSM sights, and nothing else', async () => {
    const cases: readonly (PlaceInput & { readonly lean: boolean })[] = [
      { name: 'Phở at the floor', confidence: 0.6, lean: true },
      { name: 'Phở under the floor', confidence: 0.59, lean: false },
      { name: 'Phở with no score', confidence: null, lean: false },
      { name: 'A mall', category: 'shopping', lean: false },
      { name: 'A pharmacy', category: 'health', lean: false },
      { name: 'Sân bay Liên Khương', category: 'transit', lean: true },
      { name: 'Bến xe liên tỉnh', category: 'transit', lean: true },
      { name: 'Trạm xe buýt số 3', category: 'transit', lean: false },
      { name: 'An OSM attraction', category: 'other', sources: { osm: 'n1' }, lean: true },
      {
        name: 'An OSM-linked café',
        sources: { overture: 'o', osm: 'n2' },
        confidence: 0.3,
        lean: true,
      },
      { name: 'An Overture place', category: 'other', lean: false },
      { name: 'Only Foursquare lists it', sources: { fsq_os: 'f' }, confidence: null, lean: false },
    ];
    for (const input of cases) {
      const id = await place(input);
      const { rows } = await db.pool.query<{ lean: boolean }>(
        `SELECT ${leanPlaceSql('p')} AS lean FROM pois p WHERE p.id = $1`,
        [id],
      );
      expect({ name: input.name, lean: rows[0]?.lean }).toEqual({
        name: input.name,
        lean: input.lean,
      });
    }
  });
});
