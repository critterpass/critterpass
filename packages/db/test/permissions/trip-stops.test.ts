/**
 * `trip_stops` (C1, RLS T): the cities of a trip in order. The trip's members read the route as
 * they read the trip, and get it on the always-on crew stream without subscribing to the trip;
 * nobody outside the crew sees it and no client writes it.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let secondCityId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId } = harness.fixture;
  secondCityId = await withSystem(harness.db.pool, async (tx) => {
    const city = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('stops-hue', 'Huế') RETURNING id",
    );
    const second = city.rows[0]!.id;
    await tx.query(
      `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
       SELECT t.id, t.crew_id, s.position, s.destination_id, 2
         FROM trips t,
              (VALUES (1, (SELECT destination_id FROM pois WHERE name = 'Matrix Probe POI')),
                      (2, $2::uuid)) AS s(position, destination_id)
        WHERE t.id = $1`,
      [tripId, second],
    );
    return second;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('trip_stops', () => {
  it('is read by the trip members only', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM trip_stops WHERE trip_id = $1';
    for (const kind of ['member', 'organiser', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(2);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('is never written by a client, not even the organiser', async () => {
    const { actors, tripId, crewId } = harness.fixture;
    const asOrganiser = (sql: string, params: unknown[]) =>
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) => tx.query(sql, params));
    await expect(
      asOrganiser(
        `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
         VALUES ($1, $2, 3, $3, 1)`,
        [tripId, crewId, secondCityId],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asOrganiser('UPDATE trip_stops SET nights = 9 WHERE trip_id = $1', [tripId]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asOrganiser('DELETE FROM trip_stops WHERE trip_id = $1', [tripId]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('reaches the crew on the always-on crew stream and nobody else', async () => {
    const { tripId } = harness.fixture;
    for (const kind of ['member', 'organiser'] as const) {
      const rows = (await harness.rows('crews', kind)).get('trip_stops') ?? [];
      expect(
        rows.filter((row) => row['trip_id'] === tripId).map((row) => row['position']),
        kind,
      ).toEqual(expect.arrayContaining([1, 2]));
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect((await harness.rows('crews', kind)).get('trip_stops') ?? [], kind).toEqual([]);
    }
    const { rows } = await harness.db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'trip_stops'",
    );
    expect(rows).toHaveLength(1);
  });

  it('keeps a stop in order, of at least one night, and one per position', async () => {
    const { tripId } = harness.fixture;
    const insert = (position: number, nights: number) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
           SELECT id, crew_id, $2, $3, $4 FROM trips WHERE id = $1`,
          [tripId, position, secondCityId, nights],
        ),
      );
    await expect(insert(2, 1)).rejects.toThrow(/trip_stops_trip_position_key/);
    await expect(insert(3, 0)).rejects.toThrow(/check constraint/);
    await expect(insert(7, 1)).rejects.toThrow(/check constraint/);
  });
});
