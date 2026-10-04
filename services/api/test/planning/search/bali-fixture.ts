/**
 * A Bali trip for the search suites: a crew staying at a villa in Ubud for six nights (Monday 2
 * to Saturday 7 November 2026) with dinner booked at Locavore on the Wednesday, and the places
 * the 7d-2 ("quiet dinner near the villa, open late") and 7d-4 ("omakase sushi in ubud") screens
 * search over. Minutes are straight-line "about" minutes from the villa (no router in tests):
 * drive ≈ 2.9 min a km + 3.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';

import { fromVilla, hours, TRIP_DATES, UBUD, VILLA, type BaliPlace } from './bali-places';

export * from './bali-places';

export interface BaliTrip {
  readonly pool: pg.Pool;
  readonly postgres: StartedPostgreSqlContainer;
  readonly destinationId: string;
  readonly tripId: string;
  readonly versionId: string;
  readonly organiser: string;
  readonly outsider: string;
  readonly dayIds: readonly string[];
  readonly villaId: string;
  readonly locavoreId: string;
  readonly locavoreStableId: string;
  /** Place ids by name. */
  readonly places: ReadonlyMap<string, string>;
  stop(): Promise<void>;
}

async function one(pool: pg.Pool, sql: string, values: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

export async function insertPlace(
  pool: pg.Pool,
  destinationId: string,
  place: BaliPlace,
): Promise<string> {
  return one(
    pool,
    `INSERT INTO pois (destination_id, name, category, lat, lng, address, hours, tags, curation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      destinationId,
      place.name,
      place.category,
      place.at.lat,
      place.at.lng,
      place.address,
      place.hours ?? '{}',
      place.tags ?? [],
      place.curation ?? 'auto',
    ],
  );
}

/** The trip with no places beyond the villa and Locavore; suites add the ones they search. */
export async function startBaliTrip(extra: readonly BaliPlace[] = []): Promise<BaliTrip> {
  const postgres = await startPostgres();
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 6 });
  await runMigrations(pool);
  const organiser = randomUUID();
  const outsider = randomUUID();
  for (const id of [organiser, outsider]) {
    await pool.query("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      id,
      id === organiser ? 'Rin' : 'Sam',
    ]);
  }
  const destinationId = await one(
    pool,
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
     VALUES ('bali', 'Bali', 'Indonesia', 'live', 'IDR', 'Asia/Makassar') RETURNING id`,
    [],
  );
  const crew = await one(
    pool,
    'INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id',
    ['Bali crew', organiser],
  );
  await pool.query(
    "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')",
    [crew, organiser],
  );
  const tripId = await one(
    pool,
    `INSERT INTO trips (crew_id, status, destination_id, tz) VALUES ($1, 'setup', $2, 'Asia/Makassar')
     RETURNING id`,
    [crew, destinationId],
  );
  await pool.query(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [tripId, organiser],
  );
  const villaId = await insertPlace(pool, destinationId, {
    name: 'Villa Sayan Terrace',
    category: 'stay',
    at: VILLA,
    address: UBUD,
  });
  const locavoreId = await insertPlace(pool, destinationId, {
    name: 'Locavore NXT',
    category: 'food',
    at: fromVilla(0.5, 0.3),
    address: UBUD,
    hours: hours('18:00', '22:00', ['we', 'th', 'fr', 'sa']),
    tags: ['tasting_menu'],
  });
  const versionId = await one(
    pool,
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
     RETURNING id`,
    [tripId],
  );
  const dayIds: string[] = [];
  for (const [index, date] of TRIP_DATES.entries()) {
    dayIds.push(
      await one(
        pool,
        `INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [versionId, tripId, index + 1, date],
      ),
    );
  }
  await pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, poi_id, category, starts_at, ends_at, tz,
       status)
     VALUES ($1, $2, $3, $4, 'stay', '2026-11-02T14:00:00+08:00', '2026-11-02T15:00:00+08:00',
             'Asia/Makassar', 'confirmed')`,
    [versionId, dayIds[0], tripId, villaId],
  );
  const locavoreStableId = randomUUID();
  await pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, poi_id, category, starts_at,
       ends_at, tz, status, locked_reason)
     VALUES ($1, $2, $3, $4, $5, 'dinner', '2026-11-04T19:00:00+08:00', '2026-11-04T21:30:00+08:00',
             'Asia/Makassar', 'confirmed', 'booking')`,
    [versionId, dayIds[2], tripId, locavoreStableId, locavoreId],
  );
  await pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, versionId]);
  const places = new Map<string, string>();
  for (const place of extra) places.set(place.name, await insertPlace(pool, destinationId, place));
  return {
    pool,
    postgres,
    destinationId,
    tripId,
    versionId,
    organiser,
    outsider,
    dayIds,
    villaId,
    locavoreId,
    locavoreStableId,
    places,
    async stop() {
      await pool.end();
      await postgres.stop();
    },
  };
}
