/**
 * `cost.recompute` over a migrated Postgres: prices a trip from its quotes, nightly fares, plan
 * items, the reviewed editorial index and one FX run; stores components, own share calcs and crew
 * totals; writes nothing on a rerun with the same inputs; follows quote and participant changes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { enqueue } from '../../src/boss/define-job';
import { costRecomputeJob, recomputeTripCosts } from '../../src/cost/recompute';
import { insertCrew, insertUser, startNotifyDb, until, type NotifyDb } from '../notify-fixtures';

let db: NotifyDb;
let tripId: string;
let fxUsdId: string;
const uids: Record<'a' | 'b' | 'c' | 'd', string> = { a: '', b: '', c: '', d: '' };

async function totals(): Promise<Record<string, string>> {
  const { rows } = await db.pool.query<{ user_id: string; total_minor: string }>(
    'SELECT user_id, total_minor FROM trip_share_totals WHERE trip_id = $1',
    [tripId],
  );
  return Object.fromEntries(rows.map((r) => [r.user_id, r.total_minor]));
}

async function writeStamp(): Promise<string> {
  const { rows } = await db.pool.query<{ stamp: string }>(
    `SELECT concat_ws('|',
       (SELECT string_agg(xmin::text, ',' ORDER BY id) FROM cost_components WHERE trip_id = $1),
       (SELECT string_agg(xmin::text, ',' ORDER BY id) FROM share_calcs WHERE trip_id = $1),
       (SELECT string_agg(xmin::text, ',' ORDER BY id) FROM trip_share_totals WHERE trip_id = $1),
       (SELECT count(*) FROM rt_outbox)) AS stamp`,
    [tripId],
  );
  return rows[0]?.stamp ?? '';
}

beforeAll(async () => {
  db = await startNotifyDb();
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  for (const key of Object.keys(uids) as (keyof typeof uids)[])
    uids[key] = await insertUser(db.pool);
  await q("UPDATE users SET home_airport = 'sin' WHERE id = ANY($1)", [[uids.a, uids.b]]);
  await q("UPDATE users SET home_airport = 'HKG' WHERE id = $1", [uids.c]);
  const crewId = await insertCrew(db.pool, Object.values(uids));
  await q("UPDATE crews SET settlement_currency = 'USD' WHERE id = $1", [crewId]);
  const dest = await q(
    "INSERT INTO destinations (slug, name, coverage) VALUES ('kyoto', 'Kyoto', 'live') RETURNING id",
  );
  const destinationId = (dest.rows[0] as { id: string }).id;
  const trip = await q(
    `INSERT INTO trips (crew_id, status, destination_id, tz, start_date, end_date)
     VALUES ($1, 'setup', $2, 'Asia/Tokyo', '2027-04-02', '2027-04-09') RETURNING id`,
    [crewId, destinationId],
  );
  tripId = (trip.rows[0] as { id: string }).id;
  for (const uid of Object.values(uids)) {
    await q("INSERT INTO trip_participants (trip_id, user_id, rsvp) VALUES ($1, $2, 'in')", [
      tripId,
      uid,
    ]);
  }
  await q(
    `INSERT INTO price_quotes (trip_id, kind, origin, destination_id, amount_minor, currency, source, fetched_at, frozen_at)
     VALUES ($1, 'flight', 'SIN', $2, 52000, 'USD', 'travelpayouts', '2027-02-01T00:00:00Z', '2027-02-02T00:00:00Z')`,
    [tripId, destinationId],
  );
  await q(
    `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, price_minor, currency, fetched_at, checked_at, fastest_duration_min)
     VALUES ('HKG', 'KIX', $1, '2027-04-01', 48000, 'USD', '2027-02-01T00:00:00Z', '2027-02-01T00:00:00Z', 240)`,
    [destinationId],
  );
  for (const [type, low, high] of [
    ['apartment', 3500, 7000],
    ['ryokan', 12000, 25000],
  ] as const) {
    await q(
      `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low, nightly_minor_high,
         food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on, reviewed_at)
       VALUES ($1, $2, $3, $4, 4000, 3000, 'USD', 'Editorial estimate', '2026-09-28', '2026-09-28T00:00:00Z')`,
      [destinationId, type, low, high],
    );
  }
  const fx = await q(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES
       ('EUR', 'USD', 1.08, '2027-02-01', 'frankfurter'), ('EUR', 'JPY', 162, '2027-02-01', 'frankfurter')
     RETURNING id, quote`,
  );
  fxUsdId = (fx.rows as { id: string; quote: string }[]).find((r) => r.quote === 'USD')?.id ?? '';
  const version = await q(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  const versionId = (version.rows[0] as { id: string }).id;
  const day = await q(
    'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
    [versionId, tripId],
  );
  const dayId = (day.rows[0] as { id: string }).id;
  await q(
    `INSERT INTO plan_items (version_id, day_id, trip_id, cost_model, amount_minor, currency) VALUES
       ($1, $2, $3, 'per_person', 6400, 'USD'), ($1, $2, $3, 'group', 36000, 'JPY')`,
    [versionId, dayId, tripId],
  );
  await q('UPDATE trips SET current_version_id = $1 WHERE id = $2', [versionId, tripId]);
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('cost.recompute', () => {
  it('prices every member from quotes, fares, plan items, the index and one FX run', async () => {
    const outcome = await recomputeTripCosts(db.pool, tripId, new Date('2027-02-02T00:00:00Z'));
    expect(outcome).toMatchObject({ status: 'written', members: 4 });
    // SIN (a, b, and d whose origin is estimated): 520 + food 320 + fun 240 + 7 apartment nights
    // 490 + Nara-style item 64 + ¥36,000 = $240 split four ways (60) = $1,694.
    expect(await totals()).toEqual({
      [uids.a]: '169400',
      [uids.b]: '169400',
      [uids.c]: '165400',
      [uids.d]: '169400',
    });
    const { rows } = await db.pool.query(
      'SELECT is_estimated_origin, fx_snapshot_id, jsonb_array_length(components) AS lines FROM share_calcs WHERE user_id = $1',
      [uids.d],
    );
    expect(rows).toEqual([{ is_estimated_origin: true, fx_snapshot_id: fxUsdId, lines: 6 }]);
    const outbox = await db.pool.query('SELECT channel FROM rt_outbox WHERE channel = $1', [
      `trip:${tripId}`,
    ]);
    expect(outbox.rows).toHaveLength(1);
  });

  it('writes nothing when rerun with the same inputs', async () => {
    const before = await writeStamp();
    expect(await recomputeTripCosts(db.pool, tripId)).toMatchObject({ status: 'unchanged' });
    expect(await writeStamp()).toBe(before);
  });

  it('follows a new quote and a member dropping out, keeping only the current calc', async () => {
    await db.pool.query('UPDATE price_quotes SET amount_minor = 50000 WHERE trip_id = $1', [
      tripId,
    ]);
    await db.pool.query(
      "UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2",
      [tripId, uids.b],
    );
    const outcome = await recomputeTripCosts(db.pool, tripId);
    expect(outcome).toMatchObject({ status: 'written', members: 3 });
    // The ¥36,000 group item now splits three ways ($80 each, +$20) and the SIN fare fell $20;
    // with one SIN and one HKG flyer left, d's estimated origin follows the tie rule to HKG.
    expect(await totals()).toEqual({ [uids.a]: '169400', [uids.c]: '167400', [uids.d]: '167400' });
    const versions = await db.pool.query(
      'SELECT DISTINCT version FROM share_calcs WHERE trip_id = $1',
      [tripId],
    );
    expect(versions.rows).toEqual([
      { version: outcome.status === 'written' ? outcome.version : '' },
    ]);
  });

  it('reports an unknown trip', async () => {
    expect(await recomputeTripCosts(db.pool, '0195f000-0000-7000-8000-000000000000')).toEqual({
      status: 'no_trip',
    });
  });

  it('runs as a keyed job', async () => {
    const boss = await db.startBoss([costRecomputeJob]);
    await db.pool.query('UPDATE price_quotes SET amount_minor = 51000 WHERE trip_id = $1', [
      tripId,
    ]);
    await enqueue(boss, costRecomputeJob, { trip_id: tripId });
    await until(async () => (await totals())[uids.a] === '170400');
  });
});
