/**
 * Time zone ids (packages/db/migrations/*_valid_tz_fast.sql): `app.valid_tz` accepts canonical
 * IANA ids without scanning pg_timezone_names, and every tz column stores the canonical id even
 * when a writer sends a backward-compatibility alias such as Asia/Saigon, which this image's
 * tzdata (like any build without tzdata-legacy) does not know.
 */
import { canonicalTz, generateUuidV7, TZ_ALIASES } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../src/tx';
import { anonymousActor, firstRow } from './helpers/actors';
import { insertChangeSet } from './helpers/plan-actors';
import { buildPlanFixture } from './helpers/plan-fixture';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ v: T }>(sql, params);
    return firstRow(rows).v;
  });
}

async function insertDestination(tz: string): Promise<{ id: string; tz: string }> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; tz: string }>(
      `INSERT INTO destinations (slug, name, coverage, tz)
       VALUES ($1, 'Saigon', 'live', $2) RETURNING id, tz`,
      [`saigon-${generateUuidV7()}`, tz],
    );
    return firstRow(rows);
  });
}

describe('app.canonical_tz', () => {
  it('maps every alias exactly as @cp/domain does', async () => {
    const aliases = [...TZ_ALIASES.keys()];
    const mapped = await scalar<string[]>(
      'SELECT array_agg(app.canonical_tz(a) ORDER BY o) AS v FROM unnest($1::text[]) WITH ORDINALITY AS t(a, o)',
      [aliases],
    );
    expect(mapped).toEqual(aliases.map(canonicalTz));
  });

  it('leaves canonical ids and unknown input untouched', async () => {
    const ids = ['Asia/Ho_Chi_Minh', 'Europe/Oslo', 'Etc/UTC', 'Nope/Zone'];
    const mapped = await scalar<string[]>(
      'SELECT array_agg(app.canonical_tz(a) ORDER BY o) AS v FROM unnest($1::text[]) WITH ORDINALITY AS t(a, o)',
      [ids],
    );
    expect(mapped).toEqual(ids);
  });
});

describe('app.valid_tz', () => {
  it('accepts the canonical form of every zone the platform ICU reports', async () => {
    const canonical = [...new Set(Intl.supportedValuesOf('timeZone').map(canonicalTz))];
    const rejected = await scalar<string[] | null>(
      'SELECT array_agg(z) AS v FROM unnest($1::text[]) AS z WHERE NOT app.valid_tz(z)',
      [canonical],
    );
    expect(rejected).toBeNull();
  });

  it('accepts every alias target', async () => {
    const targets = [...new Set(TZ_ALIASES.values())];
    const rejected = await scalar<string[] | null>(
      'SELECT array_agg(z) AS v FROM unnest($1::text[]) AS z WHERE NOT app.valid_tz(z)',
      [targets],
    );
    expect(rejected).toBeNull();
  });

  it('rejects unknown zones, abbreviations, offsets, wrong case and non-canonical aliases', async () => {
    const invalid = [
      '',
      'Nope/Zone',
      'Mars/Olympus_Mons',
      'ICT',
      'UTC+3',
      'Asia/Tokyo+5',
      'Asia/Tokyo foo',
      'asia/tokyo',
      'Etc/GMT+13',
      'Etc/GMT-15',
      'Asia/Saigon',
      'UTC',
    ];
    const accepted = await scalar<string[] | null>(
      'SELECT array_agg(z) AS v FROM unnest($1::text[]) AS z WHERE app.valid_tz(z)',
      [invalid],
    );
    expect(accepted).toBeNull();
  });

  it('is cheap enough for CHECK constraints (cost logged, not asserted)', async () => {
    const zones = [
      'Asia/Ho_Chi_Minh',
      'Europe/Oslo',
      'America/Argentina/Buenos_Aires',
      'Nope/Zone',
    ];
    // Microseconds per evaluation of `check` over `calls` rows; a FILTER clause keeps the scan
    // variant a per-row subplan instead of letting the planner turn it into one semi-join.
    const perCall = async (check: string, calls: number): Promise<number> => {
      const started = performance.now();
      const valid = await scalar<number>(
        `SELECT count(*) FILTER (WHERE ${check})::int AS v
         FROM generate_series(1, $2::int) AS g, LATERAL (SELECT ($1::text[])[1 + g % 4] AS z) AS t`,
        [zones, calls],
      );
      expect(valid).toBe((calls * 3) / 4);
      return ((performance.now() - started) * 1000) / calls;
    };
    const current = await perCall('app.valid_tz(z)', 20_000);
    const scan = await perCall('EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = z)', 4);
    console.info(
      `app.valid_tz: ${current.toFixed(1)} µs/call; pg_timezone_names lookup: ${scan.toFixed(1)} µs/call`,
    );
  });
});

describe('tz columns store canonical ids', () => {
  it('canonicalizes a user setting their own tz', async () => {
    const actor = anonymousActor();
    await withSystem(db.pool, (tx) =>
      tx.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [actor.uid]),
    );
    const stored = await withUser(db.pool, actor.uid, actor.device, async (tx) => {
      const { rows } = await tx.query<{ tz: string }>(
        "UPDATE users SET tz = 'Asia/Saigon' WHERE id = $1 RETURNING tz",
        [actor.uid],
      );
      return firstRow(rows).tz;
    });
    expect(stored).toBe('Asia/Ho_Chi_Minh');
  });

  it('canonicalizes destinations, pois and trips', async () => {
    const destination = await insertDestination('Asia/Saigon');
    expect(destination.tz).toBe('Asia/Ho_Chi_Minh');
    const poiTz = await scalar<string>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, timezone)
       VALUES ($1, 'Ben Thanh Market', 'market', 10.7725, 106.6980, 'Asia/Calcutta')
       RETURNING timezone AS v`,
      [destination.id],
    );
    expect(poiTz).toBe('Asia/Kolkata');

    const fx = await buildPlanFixture(db.pool);
    const tripTz = await scalar<string>(
      "UPDATE trips SET tz = 'Asia/Katmandu' WHERE id = $1 RETURNING tz AS v",
      [fx.tripId],
    );
    expect(tripTz).toBe('Asia/Kathmandu');
  });

  it('canonicalizes a scheduled timer armed with an alias', async () => {
    const stored = await withSystem(db.pool, async (tx) => {
      const { rows: armed } = await tx.query<{ id: string }>(
        `SELECT app.schedule_event('tz.probe', gen_random_uuid(), '', '2026-10-01T09:00',
                                   'Asia/Saigon', '2026-10-01T02:00Z', NULL) AS id`,
      );
      const { rows } = await tx.query<{ tz: string }>(
        'SELECT tz FROM scheduled_events WHERE id = $1',
        [firstRow(armed).id],
      );
      return firstRow(rows).tz;
    });
    expect(stored).toBe('Asia/Ho_Chi_Minh');
  });

  it('canonicalizes a plan item written by apply_change_set', async () => {
    const fx = await buildPlanFixture(db.pool);
    const stableId = generateUuidV7();
    const changeSetId = await insertChangeSet(db.pool, {
      tripId: fx.tripId,
      baseVersionId: fx.versionId,
      authorId: fx.memberId,
      ops: [
        {
          op: 'add',
          target: stableId,
          after: { day_no: 1, category: 'street-food', tz: 'Asia/Saigon' },
          reason: 'dinner in District 1',
          affected_user_ids: [],
          booking_impact: false,
        },
      ],
    });
    // Its author sends it (a draft is theirs alone); the organiser approves and applies it.
    await withUser(db.pool, fx.memberId, anonymousActor().device, (tx) =>
      tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]),
    );
    await withUser(db.pool, fx.organiserId, anonymousActor().device, async (tx) => {
      await tx.query("UPDATE change_sets SET status = 'approved' WHERE id = $1", [changeSetId]);
      await tx.query('SELECT app.apply_change_set($1)', [changeSetId]);
    });
    const tz = await scalar<string>('SELECT tz AS v FROM plan_items WHERE stable_id = $1', [
      stableId,
    ]);
    expect(tz).toBe('Asia/Ho_Chi_Minh');
  });

  it('rejects an unknown zone with a check violation', async () => {
    await expect(insertDestination('Mars/Olympus_Mons')).rejects.toMatchObject({
      code: '23514',
      constraint: 'destinations_tz_check',
    });
  });
});
