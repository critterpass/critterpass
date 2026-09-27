import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import {
  idsByTable,
  startStreamHarness,
  totalRows,
  type StreamHarness,
} from '../helpers/stream-harness';

let harness: StreamHarness;
let tripDestinationId: string;
let batur: string;
let elsewhere: string;
let snapshot: string;
let crowd: string;

function insertAlert(
  tx: { query: (sql: string, params: unknown[]) => Promise<{ rows: { id: string }[] }> },
  destination: string,
  subject: string,
  level: number,
) {
  return tx
    .query(
      `INSERT INTO hazard_alerts (destination_id, kind, subject, level, level_label, headline, source, source_url, issued_at, fetched_at)
       VALUES ($1, 'volcano', $2, $3, 'Level I (Normal)', 'Batur is at Level I (Normal)', 'magma',
               'https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas', now(), now())
       RETURNING id`,
      [destination, subject, level],
    )
    .then((result) => result.rows[0]!.id);
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  const seeded = await withSystem(harness.db.pool, async (tx) => {
    const dest = (
      await tx.query<{ id: string }>(
        "SELECT id FROM destinations WHERE slug = 'matrix-probe-destination'",
      )
    ).rows[0]!.id;
    const other = (
      await tx.query<{ id: string }>(
        "INSERT INTO destinations (slug, name) VALUES ('hazard-other', 'Other') RETURNING id",
      )
    ).rows[0]!.id;
    await tx.query('UPDATE trips SET destination_id = $1 WHERE id = $2', [dest, fixture.tripId]);
    const poi = (
      await tx.query<{ id: string }>(
        "SELECT id FROM pois WHERE destination_id = $1 AND name = 'Matrix Probe POI'",
        [dest],
      )
    ).rows[0]!.id;
    const weather = await tx.query<{ id: string }>(
      `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, date, hourly, source, fetched_at, checked_at)
       VALUES ($1, 'centroid', 0, 0, '2026-09-28', '{"day":{},"hours":[]}', 'weatherapi', now(), now())
       RETURNING id`,
      [dest],
    );
    await tx.query(
      `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, date, hourly, source, fetched_at, checked_at)
       VALUES ($1, 'centroid', 0, 0, '2026-09-28', '{"day":{},"hours":[]}', 'weatherapi', now(), now())`,
      [other],
    );
    const crowdRow = await tx.query<{ id: string }>(
      `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
       VALUES ($1, 2, array_fill(10::smallint, ARRAY[24]), 'besttime', now()) RETURNING id`,
      [poi],
    );
    return {
      dest,
      batur: await insertAlert(tx, dest, 'Batur', 1),
      elsewhere: await insertAlert(tx, other, 'Agung', 2),
      snapshot: weather.rows[0]!.id,
      crowd: crowdRow.rows[0]!.id,
    };
  });
  tripDestinationId = seeded.dest;
  batur = seeded.batur;
  elsewhere = seeded.elsewhere;
  snapshot = seeded.snapshot;
  crowd = seeded.crowd;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('hazard_alerts RLS: catalogue (class C0, read-all, system-written)', () => {
  it('is readable by any authenticated app_user', async () => {
    const ids = await withUser(
      harness.db.pool,
      harness.fixture.actors.outsider,
      'd',
      async (tx) => {
        const { rows } = await tx.query<{ id: string }>('SELECT id FROM hazard_alerts ORDER BY id');
        return rows.map((row) => row.id);
      },
    );
    expect(ids).toEqual([batur, elsewhere].sort());
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(harness.db.pool, harness.fixture.actors.organiser, 'd', (tx) =>
        tx.query('UPDATE hazard_alerts SET level = 4 WHERE id = $1', [batur]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one current row per (destination, feed, subject) and a level between 1 and 4', async () => {
    await expect(
      withSystem(harness.db.pool, (tx) => insertAlert(tx, tripDestinationId, 'Batur', 2)),
    ).rejects.toThrow(/duplicate key/i);
    await expect(
      withSystem(harness.db.pool, (tx) => insertAlert(tx, tripDestinationId, 'Rinjani', 5)),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe("trip_pack stream: the trip destination's weather, crowds and hazards", () => {
  const params = (): Record<string, string> => ({ trip_id: harness.fixture.tripId });

  it.each(['member', 'organiser'] as const)('syncs them to %s', async (actor) => {
    const ids = idsByTable(await harness.rows('trip_pack', actor, params()));
    expect(ids['hazard_alerts']).toEqual([batur]);
    expect(ids['weather_snapshots']).toEqual([snapshot]);
    expect(ids['crowd_forecasts']).toEqual([crowd]);
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)(
    'syncs zero rows to %s',
    async (actor) => {
      expect(totalRows(await harness.rows('trip_pack', actor, params()))).toBe(0);
    },
  );
});
