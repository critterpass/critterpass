/**
 * The change preview's driving minutes on the real stack: placed ideas that land between two
 * stops a short walk apart add the drive there and back on that day; dropping them adds nothing;
 * the stored leg the plan already has is the one counted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCostRoutes } from '../../src/cost/routes';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let member: SignedIn;
let tripId: string;
let farPoi: string;
const ids = {
  breakfast: '0195f000-0000-7000-8000-000000000011',
  coffee: '0195f000-0000-7000-8000-000000000012',
  temple: '0195f000-0000-7000-8000-000000000013',
};

async function one(sql: string, values: unknown[] = []): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(sql, values);
  return rows[0]?.id ?? '';
}

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerCostRoutes(app, deps),
  );
  member = await harness.signInAnonymously();
  const crewId = await one(
    "INSERT INTO crews (name, created_by, settlement_currency) VALUES ('Bali', $1, 'USD') RETURNING id",
    [member.uid],
  );
  const dest = await one(
    "INSERT INTO destinations (slug, name, drive_factor) VALUES ('bali', 'Bali', 1.3) RETURNING id",
  );
  tripId = await one(
    `INSERT INTO trips (crew_id, status, tz, destination_id) VALUES ($1, 'setup', 'Asia/Makassar', $2)
     RETURNING id`,
    [crewId, dest],
  );
  await harness.pool.query(
    "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')",
    [crewId, member.uid],
  );
  await harness.pool.query(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [tripId, member.uid],
  );
  const near = await one(
    `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES
       ($1, 'Warung', 'food', -8.5069, 115.2625) RETURNING id`,
    [dest],
  );
  const coffee = await one(
    "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'Seniman', 'food', -8.5075, 115.2635) RETURNING id",
    [dest],
  );
  farPoi = await one(
    "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'Tirta Empul', 'temple_shrine', -8.4153, 115.3153) RETURNING id",
    [dest],
  );
  await harness.pool.query(
    `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources)
     VALUES ($1, $2, 'Tirta Empul', 'temple_shrine', -8.4153, 115.3153, $3, '{save}')`,
    [tripId, farPoi, [member.uid]],
  );
  const version = await one(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  const day = await one(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-10-17') RETURNING id",
    [version, tripId],
  );
  for (const [stable, poi, from, to] of [
    [ids.breakfast, near, '08:00', '09:00'],
    [ids.coffee, coffee, '15:00', '16:00'],
  ] as const) {
    await harness.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, poi_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Makassar', $7)`,
      [
        version,
        day,
        tripId,
        stable,
        `2026-10-17T${from}:00+08:00`,
        `2026-10-17T${to}:00+08:00`,
        poi,
      ],
    );
  }
  // The stored leg from breakfast to the temple, as the routing job would have kept it.
  await harness.pool.query(
    `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, minutes, mode, approx,
                            meters, source)
     VALUES ($1, $2, $3, $4, $5, 52, 'drive', false, 14000, 'valhalla')`,
    [tripId, version, day, ids.breakfast, ids.temple],
  );
  await harness.pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [
    version,
    tripId,
  ]);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const preview = async (accepted: boolean) => {
  const response = await harness.request(`/v1/trips/${tripId}/costs/preview`, {
    method: 'POST',
    headers: { cookie: member.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      ops: [
        {
          op: 'add',
          target: ids.temple,
          after: {
            day_no: 1,
            starts_at: '2026-10-17T10:00:00+08:00',
            ends_at: '2026-10-17T11:30:00+08:00',
            poi_id: farPoi,
          },
          reason: 'ideas_placed',
          affected_user_ids: [],
          booking_impact: false,
          accepted,
        },
      ],
    }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { driving_delta_min: number };
};

describe('POST /v1/trips/{id}/costs/preview driving minutes', () => {
  it('adds the drive to a placed idea and back, counting the stored leg', async () => {
    const { driving_delta_min: delta } = await preview(true);
    // 52 stored minutes there, the straight-line drive back, and the short walk between the two
    // stops it splits never counted.
    expect(delta).toBeGreaterThan(52);
    expect(delta).toBeLessThan(52 + 60);
  });

  it('adds nothing when the placed idea is dropped', async () => {
    expect((await preview(false)).driving_delta_min).toBe(0);
  });
});
