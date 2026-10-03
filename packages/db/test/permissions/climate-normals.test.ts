/**
 * `climate_normals` (C0, RLS R): the usual chance of rain by hour per destination cell and month.
 * Every signed-in reader may read it (the fit routes serve it over HTTP); nobody writes it through
 * app_user; it is not published or synced. A row holds exactly 24 hourly values from 0 to 100.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { streamedTables, visibleRows } from '../helpers/setup-privacy';
import { STREAM_ACTORS, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('climate_normals', () => {
  it.each(STREAM_ACTORS)('is read by %s and written by nobody through app_user', async (kind) => {
    const uid = harness.fixture.actors[kind];
    expect(await visibleRows(harness, uid, 'SELECT 1 FROM climate_normals')).toBe(1);
    await expect(
      withUser(harness.db.pool, uid, randomUUID(), (tx) =>
        tx.query('UPDATE climate_normals SET years = years'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is served over HTTP only: not published, not synced', async () => {
    const { rows } = await harness.db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'climate_normals'",
    );
    expect(rows).toEqual([]);
    expect(streamedTables(harness).has('climate_normals')).toBe(false);
  });

  it('holds exactly 24 hourly values from 0 to 100', async () => {
    const insert = (values: string) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO climate_normals (destination_id, cell, month, rain_pct, source, years)
           SELECT destination_id, '1.0,1.0', 11, ${values}, 'weatherapi_history', 3
             FROM climate_normals LIMIT 1`,
        ),
      );
    await expect(insert('array_fill(10, ARRAY[23])::smallint[]')).rejects.toThrow(
      /check constraint/,
    );
    await expect(insert('array_fill(101, ARRAY[24])::smallint[]')).rejects.toThrow(
      /check constraint/,
    );
    await insert('array_fill(10, ARRAY[24])::smallint[]');
  });
});
