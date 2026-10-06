/**
 * A destination browse against real Postgres carries what a pin shows of a place the phone never
 * synced (hours, must-see, pick rank, why-go and best-time lines in the reader's language where
 * stored) and fills a map page past the 50 a name search returns.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MAX_BROWSE_LIMIT, searchPlaces, type PlaceSearchFilters } from '../../src/places/search';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let daNang: string;
const vietReader = randomUUID();

const HOURS = { weekly: { mo: [{ start: '07:00', end: '17:30' }] } };
const PLAIN_PLACES = 70;

async function seed(values: {
  name: string;
  lat: number;
  curation?: 'auto' | 'editorial';
  editorial?: object;
  hours?: object;
  pickRank?: number;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation, editorial, hours,
                       pick_rank, pick_source, source_ids, confidence)
     VALUES ($1, $2, 'nature', $3, 108.22, $4, $5, $6, $7, $8, $9, 0.9) RETURNING id`,
    [
      daNang,
      values.name,
      values.lat,
      values.curation ?? 'auto',
      JSON.stringify(values.editorial ?? {}),
      JSON.stringify(values.hours ?? {}),
      values.pickRank ?? null,
      values.pickRank === undefined ? null : 'named',
      JSON.stringify({ overture: `o-${values.name}` }),
    ],
  );
  return rows[0]!.id;
}

/** Runs the search as `reader` (no reader: English). */
async function search(filters: PlaceSearchFilters, reader?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (reader !== undefined) {
      await client.query("SELECT set_config('app.uid', $1, true)", [reader]);
    }
    return await searchPlaces(client, filters);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz, place_bounds) VALUES
       ('vn-da-nang', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh',
        ST_MakeEnvelope(107.9, 15.85, 108.35, 16.2, 4326)::geography)
     RETURNING id`,
  );
  daNang = rows[0]!.id;
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [vietReader]);
  await pool.query("INSERT INTO user_settings (user_id, app_locale) VALUES ($1, 'vi')", [
    vietReader,
  ]);

  await seed({
    name: 'Marble Mountains',
    lat: 16.0029,
    curation: 'editorial',
    hours: HOURS,
    editorial: {
      must_see: true,
      why_go: 'Caves and pagodas inside five marble hills.',
      best_time: 'Early morning, before the tour buses.',
      i18n: { vi: { why_go: 'Hang động và chùa trong năm ngọn núi đá.' } },
    },
  });
  const picked = await seed({ name: 'Dragon Bridge', lat: 16.0612, pickRank: 2 });
  await pool.query(`INSERT INTO place_profiles (poi_id, status, texts) VALUES ($1, 'ready', $2)`, [
    picked,
    JSON.stringify({
      en: {
        why_go: 'It breathes fire on weekend nights.',
        best_time: 'Saturday 9 pm.',
        crowd: '',
        facts: [],
      },
      vi: {
        why_go: 'Rồng phun lửa tối cuối tuần.',
        best_time: '21 giờ thứ Bảy.',
        crowd: '',
        facts: [],
      },
    }),
  ]);
  const pending = await seed({ name: 'Han Market', lat: 16.068 });
  await pool.query(
    `INSERT INTO place_profiles (poi_id, status, texts) VALUES ($1, 'pending', $2)`,
    [
      pending,
      JSON.stringify({ en: { why_go: 'Not ready yet.', best_time: 'x', crowd: '', facts: [] } }),
    ],
  );
  // Plain places 150 m apart, so none reads as another's listing.
  for (let i = 0; i < PLAIN_PLACES; i += 1) {
    await seed({ name: `Lookout ${String(i).padStart(2, '0')}`, lat: 15.9 + i * 0.0014 });
  }
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('a destination browse', () => {
  it("carries the editors' note, hours and must-see in the reader's language", async () => {
    const english = await search({ destinationId: daNang, limit: MAX_BROWSE_LIMIT });
    const sight = english.find((item) => item.name === 'Marble Mountains');
    expect(sight).toMatchObject({
      mustSee: true,
      pickRank: null,
      hours: HOURS,
      whyGo: 'Caves and pagodas inside five marble hills.',
      bestTime: 'Early morning, before the tour buses.',
    });

    const viet = await search({ destinationId: daNang, limit: MAX_BROWSE_LIMIT }, vietReader);
    const vietSight = viet.find((item) => item.name === 'Marble Mountains');
    // The note's Vietnamese line where written, its English line where not.
    expect(vietSight?.whyGo).toBe('Hang động và chùa trong năm ngọn núi đá.');
    expect(vietSight?.bestTime).toBe('Early morning, before the tour buses.');
  });

  it("reads a ready AI profile's lines for a pick, and nothing from a pending one", async () => {
    const english = await search({ destinationId: daNang, limit: MAX_BROWSE_LIMIT });
    expect(english.find((item) => item.name === 'Dragon Bridge')).toMatchObject({
      mustSee: false,
      pickRank: 2,
      hours: null,
      whyGo: 'It breathes fire on weekend nights.',
      bestTime: 'Saturday 9 pm.',
    });
    expect(english.find((item) => item.name === 'Han Market')).toMatchObject({
      whyGo: null,
      bestTime: null,
    });

    const viet = await search({ destinationId: daNang, limit: MAX_BROWSE_LIMIT }, vietReader);
    expect(viet.find((item) => item.name === 'Dragon Bridge')?.whyGo).toBe(
      'Rồng phun lửa tối cuối tuần.',
    );
  });

  it('fills a map page past 50 places, while a name search stays at 50', async () => {
    const page = await search({ destinationId: daNang, limit: MAX_BROWSE_LIMIT });
    expect(page).toHaveLength(PLAIN_PLACES + 3);
    expect(new Set(page.map((item) => item.id)).size).toBe(page.length);
    // The editors' place leads the browse, as before.
    expect(page[0]?.name).toBe('Marble Mountains');

    const named = await search({ q: 'Lookout', destinationId: daNang, limit: MAX_BROWSE_LIMIT });
    expect(named).toHaveLength(50);
  });
});
