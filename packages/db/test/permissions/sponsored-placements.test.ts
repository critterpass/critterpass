/**
 * `sponsored_placements`: every signed-in reader may read an active placement (a paused one is
 * nobody's), only the server writes one (the ops console runs as app_system), and neither the
 * placements nor their per-day counts ever reach replication or the guide.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { asRole, visibleRows } from '../helpers/setup-privacy';
import { STREAM_ACTORS, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const active = 'SELECT 1 FROM sponsored_placements';

describe('sponsored_placements', () => {
  it('shows active placements to every reader', async () => {
    for (const kind of STREAM_ACTORS) {
      expect(await visibleRows(harness, harness.fixture.actors[kind], active), kind).toBe(1);
    }
  });

  it('is written by the server only, never by any app_user', async () => {
    for (const kind of STREAM_ACTORS) {
      const uid = harness.fixture.actors[kind];
      await expect(
        withUser(harness.db.pool, uid, randomUUID(), (tx) =>
          tx.query(
            `INSERT INTO sponsored_placements
               (partner, poi_id, destination_id, list_kinds, starts_at, ends_at, created_by)
             SELECT 'viator', poi_id, destination_id, '{picks}', now(), now() + interval '1 day', $1
               FROM sponsored_placements LIMIT 1`,
            [uid],
          ),
        ),
        kind,
      ).rejects.toThrow(/permission denied/i);
      await expect(
        withUser(harness.db.pool, uid, randomUUID(), (tx) =>
          tx.query("UPDATE sponsored_placements SET status = 'paused'"),
        ),
        kind,
      ).rejects.toThrow(/permission denied/i);
    }
    await withSystem(harness.db.pool, (tx) =>
      tx.query("UPDATE sponsored_placements SET status = 'paused'"),
    );
    expect(await visibleRows(harness, harness.fixture.actors.member, active)).toBe(0);
  });

  it('keeps placements and counts away from replication and every client', async () => {
    const { rows } = await harness.db.pool.query(
      `SELECT tablename FROM pg_publication_tables
        WHERE pubname = 'powersync' AND tablename LIKE 'sponsored%'`,
    );
    expect(rows).toHaveLength(0);
    for (const table of ['sponsored_placements', 'sponsored_event_counts']) {
      await expect(
        asRole(harness.db.pool, 'powersync_repl', `SELECT 1 FROM ${table}`),
      ).rejects.toThrow(/permission denied/i);
    }
    const counts = 'SELECT 1 FROM sponsored_event_counts';
    for (const kind of STREAM_ACTORS) {
      expect(await visibleRows(harness, harness.fixture.actors[kind], counts), kind).toBe(0);
    }
    const read = await asRole(harness.db.pool, 'admin_reader', counts);
    expect(read.rowCount).toBe(1);
  });
});
