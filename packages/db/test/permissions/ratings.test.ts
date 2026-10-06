/**
 * `ratings`: a traveller's verdicts and tips are theirs alone (crewmates included never read
 * them) and only the server writes them; other crews meet a tip only as an anonymous place tip.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let poiId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, tripId } = harness.fixture;
  poiId = await withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "SELECT id FROM pois WHERE name = 'Matrix Probe POI'",
    );
    await tx.query(
      `INSERT INTO ratings (trip_id, poi_id, user_id, verdict, tip, tip_status)
       VALUES ($1, $2, $3, 'loved', 'Go early.', 'pending')`,
      [tripId, rows[0]!.id, actors.member],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('ratings', () => {
  it('is read by its author only', async () => {
    const { actors } = harness.fixture;
    const sql = 'SELECT tip FROM ratings WHERE poi_id = $1';
    expect(await visibleRows(harness, actors.member, sql, [poiId])).toBe(1);
    expect(await visibleRows(harness, actors.organiser, sql, [poiId])).toBe(0);
    expect(await visibleRows(harness, actors.outsider, sql, [poiId])).toBe(0);
  });

  it('is written by the server only', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query(
          "INSERT INTO ratings (trip_id, poi_id, user_id, verdict) VALUES ($1, $2, $3, 'fine')",
          [tripId, poiId, actors.member],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
