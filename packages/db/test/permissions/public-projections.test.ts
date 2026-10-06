/**
 * `public_reader` and the public views behind web previews: the role reads only the views, the
 * views answer only for the live link named in the transaction, and the proposal view carries an
 * explicit allow-list of columns (no prices, notes, people or ids). The plan view answers only for
 * a live plan link whose plan is published, with its own allow-list.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { insertTrip } from '../helpers/actors';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

const SEAT_HASH = 'a'.repeat(64);
const PLAN_HASH = 'b'.repeat(64);
const PENDING_PLAN_HASH = 'c'.repeat(64);
const REVOKED_PLAN_HASH = 'd'.repeat(64);

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;
let sentVersion: string;

async function asPublicReader<T>(
  settings: { code?: string; seat?: string; plan?: string },
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE public_reader');
    await client.query(
      `SELECT set_config('app.public_code', $1, true), set_config('app.public_seat', $2, true),
              set_config('app.public_plan', $3, true)`,
      [settings.code ?? '', settings.seat ?? '', settings.plan ?? ''],
    );
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const plans = (plan?: string) =>
  asPublicReader(plan === undefined ? {} : { plan }, async (tx) => {
    const { rows } = await tx.query<{ destination_name: string; crew_names: string[] | null }>(
      'SELECT destination_name, crew_names, days FROM public.shared_plan_public',
    );
    return rows;
  });

const days = (settings: { code?: string; seat?: string }) =>
  asPublicReader(settings, async (tx) => {
    const { rows } = await tx.query<{ day_no: number; theme: string | null; stops: string[] }>(
      'SELECT day_no, theme, stops FROM public.proposal_public ORDER BY day_no',
    );
    return rows;
  });

async function version(tripId: string, status: string): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', $2) RETURNING id",
      [tripId, status],
    );
    return rows[0]!.id;
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
  sentVersion = await version(fixture.tripId, 'current');
  const draft = await version(fixture.tripId, 'draft');
  await withSystem(db.pool, async (tx) => {
    const day = async (versionId: string, dayNo: number, theme: string) =>
      (
        await tx.query<{ id: string }>(
          'INSERT INTO plan_days (version_id, trip_id, day_no, theme) VALUES ($1, $2, $3, $4) RETURNING id',
          [versionId, fixture.tripId, dayNo, theme],
        )
      ).rows[0]!.id;
    const first = await day(sentVersion, 1, 'Villa, pool, nothing else');
    await day(sentVersion, 2, 'Batur sunrise hike');
    await day(draft, 1, 'Unsent idea');
    await tx.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, custom_place, notes, amount_minor, currency)
       VALUES ($1, $2, $3, '{"name":"Canggu","lat":0,"lng":0}', 'gate code 4411', 120000, 'USD')`,
      [sentVersion, first, fixture.tripId],
    );
    await tx.query(
      `INSERT INTO proposals (trip_id, created_by, reply_by, status, sent_at, version_id)
       VALUES ($1, $2, now() + interval '7 days', 'sent', now(), $3)`,
      [fixture.tripId, fixture.organiserId, sentVersion],
    );
    await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [fixture.tripId, draft]);
    const code = (value: string, extra: string) =>
      tx.query(
        `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by, status, expires_at)
         VALUES ($1, 'trip', $2, $3, $4, ${extra})`,
        [value, fixture.tripId, fixture.crewId, fixture.organiserId],
      );
    await code('HYPE2K', "'active', now() + interval '3 days'");
    await code('GQNE2K', "'revoked', now() + interval '3 days'");
    await code('PAST2K', "'active', now() - interval '1 minute'");
    await tx.query(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
       VALUES ('CREW2K', 'crew', $1, $1, $2)`,
      [fixture.crewId, fixture.organiserId],
    );
    await tx.query(
      `INSERT INTO invites (crew_id, trip_id, inviter_id, kind, seat_token_hash, status, expires_at)
       VALUES ($1, $2, $3, 'personal', $4, 'pending', now() + interval '14 days')`,
      [fixture.crewId, fixture.tripId, fixture.organiserId, SEAT_HASH],
    );
    const destination = (
      await tx.query<{ id: string }>(
        "INSERT INTO destinations (slug, name) VALUES ('public-ubud', 'Ubud') RETURNING id",
      )
    ).rows[0]!.id;
    const projection = JSON.stringify({
      destination_name: 'Ubud',
      crew_names: null,
      cost_pp_rounded_minor: 124000,
      photos: ['trips/secret/photo-1.jpg'],
      days: [{ day_no: 1, theme: 'Rice terraces', places: [{ poi_id: 'p1', name: 'Tegalalang' }] }],
    });
    const plan = async (tripId: string, status: string) =>
      (
        await tx.query<{ id: string }>(
          `INSERT INTO shared_plans (trip_id, destination_id, status, projection)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [tripId, destination, status, projection],
        )
      ).rows[0]!.id;
    const published = await plan(fixture.tripId, 'published');
    const otherTrip = await insertTrip(tx, { crewId: fixture.crewId, status: 'voting' });
    const pending = await plan(otherTrip, 'pending_consent');
    await tx.query(
      `INSERT INTO plan_links (trip_id, shared_plan_id, token_hash, revoked_at)
       VALUES ($1, $2, $3, NULL), ($4, $5, $6, NULL), ($1, $2, $7, now())`,
      [
        fixture.tripId,
        published,
        PLAN_HASH,
        otherTrip,
        pending,
        PENDING_PLAN_HASH,
        REVOKED_PLAN_HASH,
      ],
    );
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('public.proposal_public', () => {
  it('shows the sent proposal for a live trip code, never the unsent draft', async () => {
    expect(await days({ code: 'HYPE2K' })).toEqual([
      { day_no: 1, theme: 'Villa, pool, nothing else', stops: ['Canggu'] },
      { day_no: 2, theme: 'Batur sunrise hike', stops: [] },
    ]);
  });

  it('shows the same draft for an open personal seat', async () => {
    expect(await days({ seat: SEAT_HASH })).toHaveLength(2);
  });

  it('shows nothing for a revoked, expired, crew or unknown code, or with no link set', async () => {
    for (const code of ['GQNE2K', 'PAST2K', 'CREW2K', 'ZZZZ2K']) {
      expect(await days({ code })).toEqual([]);
    }
    expect(await days({})).toEqual([]);
  });

  it('carries only its allow-listed columns', async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'proposal_public' ORDER BY ordinal_position`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'day_no',
      'date',
      'theme',
      'days_total',
      'stops',
    ]);
  });
});

describe('public.shared_plan_public', () => {
  it('shows a published plan for its live link, cut to names and places', async () => {
    expect(await plans(PLAN_HASH)).toEqual([
      {
        destination_name: 'Ubud',
        crew_names: null,
        days: [
          { day_no: 1, theme: 'Rice terraces', places: [{ name: 'Tegalalang', category: null }] },
        ],
      },
    ]);
  });

  it('shows nothing for a plan waiting on consent, a revoked or unknown link, or with no link set', async () => {
    for (const plan of [PENDING_PLAN_HASH, REVOKED_PLAN_HASH, 'e'.repeat(64)]) {
      expect(await plans(plan)).toEqual([]);
    }
    expect(await plans()).toEqual([]);
  });

  it('carries only its allow-listed columns', async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'shared_plan_public'
        ORDER BY ordinal_position`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'shared_plan_id',
      'title',
      'destination_name',
      'days_count',
      'travel_month',
      'travel_year',
      'crew_size',
      'crew_names',
      'travelled',
      'tags',
      'days',
      'rating_avg',
      'rating_count',
      'copies_count',
    ]);
  });
});

describe('public_reader', () => {
  // PostGIS's spatial_ref_sys (public reference data, readable by every role) is the one exception.
  it('cannot read any base table', async () => {
    const { rows } = await db.pool.query<{ table_name: string }>(
      `SELECT c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('public', 'app', 'ops', 'llm') AND c.relkind IN ('r', 'p')
          AND c.relname <> 'spatial_ref_sys'
          AND has_table_privilege('public_reader', c.oid, 'SELECT')`,
    );
    expect(rows).toEqual([]);
  });

  it('is denied a direct read of trips and plan items', async () => {
    for (const table of [
      'trips',
      'plan_items',
      'join_codes',
      'invites',
      'shared_plans',
      'plan_links',
    ]) {
      await expect(
        asPublicReader({ code: 'HYPE2K' }, (tx) => tx.query(`SELECT 1 FROM ${table} LIMIT 1`)),
      ).rejects.toThrow(/permission denied/);
    }
  });
});
