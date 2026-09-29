/**
 * `cost.recompute` with a trip room plan: each occupied room is one component split between the
 * people in it, so per-member room shares add up exactly to the room totals and unequal rooms give
 * unequal shares; a member in no room pays for none; the index stay estimate keeps only the nights
 * no room plan prices; and a swap moves the share on rerun without leaving a component behind.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recomputeTripCosts } from '../../src/cost/recompute';
import { insertCrew, insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';

let db: NotifyDb;
let tripId: string;
const uids: Record<'a' | 'b' | 'c' | 'd', string> = { a: '', b: '', c: '', d: '' };

const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);

async function roomLines(): Promise<Record<string, bigint>> {
  const { rows } = await db.pool.query<{
    user_id: string;
    components: { component_key: string; amount_minor: string | null }[];
  }>('SELECT user_id, components FROM share_calcs WHERE trip_id = $1', [tripId]);
  return Object.fromEntries(
    rows.map((row) => [
      row.user_id,
      row.components
        .filter((line) => line.component_key.startsWith('room:'))
        .reduce((sum, line) => sum + BigInt(line.amount_minor ?? '0'), 0n),
    ]),
  );
}

async function componentKeys(): Promise<string[]> {
  const { rows } = await db.pool.query<{ component_key: string }>(
    'SELECT component_key FROM cost_components WHERE trip_id = $1 ORDER BY component_key',
    [tripId],
  );
  return rows.map((row) => row.component_key);
}

beforeAll(async () => {
  db = await startNotifyDb();
  for (const key of Object.keys(uids) as (keyof typeof uids)[])
    uids[key] = await insertUser(db.pool);
  const crewId = await insertCrew(db.pool, Object.values(uids));
  await q("UPDATE crews SET settlement_currency = 'USD' WHERE id = $1", [crewId]);
  const dest = await q(
    "INSERT INTO destinations (slug, name, coverage) VALUES ('kyoto-rooms', 'Kyoto', 'live') RETURNING id",
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
    `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
       nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on,
       reviewed_at)
     VALUES ($1, 'ryokan', 12000, 25000, 4000, 3000, 'USD', 'Editorial estimate', '2026-09-28',
       '2026-09-28T00:00:00Z')`,
    [destinationId],
  );
}, 240_000);

afterAll(async () => {
  await db.stop();
});

describe('cost.recompute with a room plan', () => {
  it('prices only the index stay when there is no room plan', async () => {
    await recomputeTripCosts(db.pool, tripId);
    expect(await componentKeys()).toEqual(['index:food', 'index:fun', 'index:stay:ryokan']);
  });

  it('splits each room between its people and keeps the index stay for unpriced nights', async () => {
    const rooms = [
      {
        stay_key: 'stay-1',
        stay_type: 'ryokan',
        stay_nights: 2,
        key: 'room-1',
        capacity: 2,
        nightly_minor: 30_001,
        label: 'Room 1',
      },
      {
        stay_key: 'stay-1',
        stay_type: 'ryokan',
        stay_nights: 2,
        key: 'room-2',
        capacity: 1,
        nightly_minor: 20_000,
        label: 'Room 2',
      },
    ];
    await q(`INSERT INTO room_plans (trip_id, rooms, currency, nights) VALUES ($1, $2, 'USD', 2)`, [
      tripId,
      JSON.stringify(rooms),
    ]);
    await q(
      `INSERT INTO room_assignments (trip_id, stay_key, room_key, user_id) VALUES
         ($1, 'stay-1', 'room-1', $2), ($1, 'stay-1', 'room-1', $3), ($1, 'stay-1', 'room-2', $4)`,
      [tripId, uids.a, uids.b, uids.c],
    );
    await recomputeTripCosts(db.pool, tripId);
    expect(await componentKeys()).toEqual([
      'index:food',
      'index:fun',
      'index:stay:ryokan',
      'room:stay-1:room-1',
      'room:stay-1:room-2',
    ]);
    const { rows } = await db.pool.query<{ component_key: string; amount_minor: string }>(
      "SELECT component_key, amount_minor FROM cost_components WHERE trip_id = $1 AND component_key LIKE 'index:stay:%'",
      [tripId],
    );
    // Seven nights at $250, less the two the room plan prices.
    expect(rows[0]?.amount_minor).toBe(String(25_000 * 5));
    const lines = await roomLines();
    expect((lines[uids.a] ?? 0n) + (lines[uids.b] ?? 0n)).toBe(60_002n);
    expect(lines[uids.c]).toBe(40_000n);
    expect(lines[uids.a]).not.toBe(lines[uids.c]);
    expect(lines[uids.d] ?? 0n).toBe(0n);
  });

  it('moves the share on a swap and leaves no component behind', async () => {
    await q("UPDATE room_assignments SET room_key = 'room-2' WHERE trip_id = $1 AND user_id = $2", [
      tripId,
      uids.b,
    ]);
    await q("UPDATE room_assignments SET room_key = 'room-1' WHERE trip_id = $1 AND user_id = $2", [
      tripId,
      uids.c,
    ]);
    await q('UPDATE room_plans SET updated_at = now() WHERE trip_id = $1', [tripId]);
    await recomputeTripCosts(db.pool, tripId);
    const lines = await roomLines();
    expect(lines[uids.b]).toBe(40_000n);
    expect((lines[uids.a] ?? 0n) + (lines[uids.c] ?? 0n)).toBe(60_002n);
    await q("DELETE FROM room_assignments WHERE trip_id = $1 AND room_key = 'room-2'", [tripId]);
    await recomputeTripCosts(db.pool, tripId);
    expect(await componentKeys()).not.toContain('room:stay-1:room-2');
  });
});
