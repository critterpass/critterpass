/**
 * A crew of two settling in SGD, priced like a Lisbon trip: the nightly fare and the food and fun
 * index come in USD, the room estimate in SGD. When the friend drops out the re-split converts
 * every price into the settlement currency with the latest rates, with or without a stay.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runDropout } from '../../src/jobs/proposal/dropout';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;

const q = async <T>(sql: string, params: unknown[] = []) =>
  (await harness.pool.query(sql, params)).rows as T[];

async function lisbonTrip(withStay: boolean) {
  const [organiser, friend] = [randomUUID(), randomUUID()];
  for (const [id, name] of [
    [organiser, 'Organiser'],
    [friend, 'Friend'],
  ] as const) {
    await q(
      `INSERT INTO users (id, status, display_name, tz) VALUES ($1, 'registered', $2, 'Asia/Singapore')`,
      [id, `${name} Test`],
    );
  }
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by, settlement_currency) VALUES ('Lisbon', $1, 'SGD') RETURNING id",
    [organiser],
  );
  for (const id of [organiser, friend]) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crew!.id,
      id,
      id === organiser ? 'organiser' : 'member',
    ]);
  }
  const [trip] = await q<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crew!.id],
  );
  const tripId = trip!.id;
  for (const id of [organiser, friend]) {
    await q(
      'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
      [tripId, id, id === organiser ? 'organiser' : 'member', id === organiser ? 'in' : 'out'],
    );
  }
  const components: [string, string, string, string, string, string[] | null, string | null][] = [
    ['fare:SIN', 'flight', 'person', '90900', 'USD', null, 'SIN'],
    ['index:food', 'food', 'person', '28000', 'USD', null, null],
    ['index:fun', 'fun', 'person', '17500', 'USD', null, null],
  ];
  if (withStay)
    components.push([
      'room:stay-1:room-1',
      'stay',
      'room',
      '53712',
      'SGD',
      [organiser, friend],
      null,
    ]);
  for (const [key, kind, unit, amount, currency, memberIds, origin] of components) {
    await q(
      `INSERT INTO cost_components (trip_id, calc_version, component_key, kind, unit, is_shared,
                                    member_ids, amount_minor, currency, source, seen_at, origin)
       VALUES ($1, 'cv_test', $2, $3, $4, $5, $6, $7, $8, 'estimate', now(), $9)`,
      [tripId, key, kind, unit, unit !== 'person', memberIds, amount, currency, origin],
    );
  }
  return { tripId, organiser, friend };
}

beforeAll(async () => {
  harness = await startJobsHarness();
  await q(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES
       ('EUR', 'USD', '1.1700000000', current_date, 'ecb'),
       ('EUR', 'SGD', '1.5000000000', current_date, 'ecb')`,
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('dropout re-split across currencies', () => {
  it('re-splits a trip priced in USD and SGD in the crew settlement currency', async () => {
    const { tripId, organiser, friend } = await lisbonTrip(true);
    const outcome = await runDropout(harness.pool, tripId, friend);
    expect(outcome.status).toBe('built');
    const [row] = await q<{ members: { uid: string; delta_minor: string }[] }>(
      'SELECT members FROM trip_dropouts WHERE trip_id = $1 AND user_id = $2',
      [tripId, friend],
    );
    expect(row!.members.map((m) => m.uid)).toEqual([organiser]);
    // The organiser takes over the friend's half of the SGD room.
    expect(BigInt(row!.members[0]!.delta_minor)).toBe(53712n / 2n);
  });

  it('writes the re-split for a trip without a stay', async () => {
    const { tripId, organiser, friend } = await lisbonTrip(false);
    const outcome = await runDropout(harness.pool, tripId, friend);
    expect(outcome.dropoutId).not.toBeNull();
    const [row] = await q<{ members: { uid: string; delta_minor: string }[] }>(
      'SELECT members FROM trip_dropouts WHERE trip_id = $1 AND user_id = $2',
      [tripId, friend],
    );
    expect(row!.members).toEqual([expect.objectContaining({ uid: organiser, delta_minor: '0' })]);
  });
});
