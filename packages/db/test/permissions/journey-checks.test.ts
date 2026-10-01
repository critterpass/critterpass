/**
 * `journey_checks` (C2, RLS T, not synced): the latest running-late ETA per member and plan item.
 * Its owner and the item's other attendees read it; crewmates the item is not for, outsiders, the
 * guide and the replication role read nothing; only the server writes it. The table has no column
 * that could hold a coordinate.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withUser } from '../../src/tx';
import { asRole, streamedTables, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
const PROBE = 'SELECT 1 FROM journey_checks WHERE trip_id = $1';

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('journey_checks', () => {
  it('has no column that could hold a position', async () => {
    const { rows } = await harness.db.pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'journey_checks'`,
    );
    const names = rows.map((row) => row.column_name).sort();
    expect(names).toEqual(
      [
        'checked_at',
        'created_at',
        'disruption_id',
        'eta_at',
        'id',
        'item_id',
        'late_min',
        'late_streak',
        'mode',
        'on_time_streak',
        'traffic',
        'trip_id',
        'updated_at',
        'user_id',
      ].sort(),
    );
    for (const row of rows) {
      expect(['geography', 'geometry', 'point', 'jsonb', 'json']).not.toContain(row.data_type);
    }
  });

  it('is read by its owner and the attendees of the item only', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['organiser', 'member', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], PROBE, [tripId]), kind).toBeGreaterThan(0);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], PROBE, [tripId]), kind).toBe(0);
    }
    const client = await harness.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE plan_items SET attendee_ids = ARRAY[$2, $3]::uuid[]
          WHERE id = (SELECT item_id FROM journey_checks WHERE trip_id = $1 LIMIT 1)`,
        [tripId, actors.organiser, actors.coOrganiser],
      );
      const seen = async (uid: string) => {
        await client.query('SAVEPOINT probe');
        await client.query('SET LOCAL ROLE app_user');
        await client.query("SELECT set_config('app.uid', $1, true)", [uid]);
        const { rowCount } = await client.query(PROBE, [tripId]);
        await client.query('ROLLBACK TO SAVEPOINT probe');
        return rowCount ?? 0;
      };
      expect(await seen(actors.coOrganiser), 'co-attendee').toBeGreaterThan(0);
      expect(await seen(actors.member), 'crewmate not on the item').toBe(0);
      expect(await seen(actors.organiser), 'owner').toBeGreaterThan(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('is never written by app_user, read by the guide, published or synced', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('UPDATE journey_checks SET late_min = 0 WHERE trip_id = $1', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM journey_checks'),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(harness.db.pool, 'powersync_repl', 'SELECT 1 FROM journey_checks'),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await harness.db.pool.query(
      'SELECT pubname FROM pg_publication_tables WHERE tablename = $1',
      ['journey_checks'],
    );
    expect(rows).toEqual([]);
    expect(streamedTables(harness).has('journey_checks')).toBe(false);
  });
});
