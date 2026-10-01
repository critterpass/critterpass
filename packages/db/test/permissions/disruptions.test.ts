/**
 * `disruptions` (C1, RLS T): every active member of the trip's crew reads the trip's disruptions
 * and syncs them on the trip stream; only the server writes them. The guide reads them through
 * `llm.disruptions`, which leaves out the raw source snapshot and who chose an option.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('disruptions', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'disruptions');
  });

  it('shows the guide the trip in context without the source snapshot', async () => {
    const { actors, tripId } = harness.fixture;
    const rows = await withGuideReader(
      harness.db.pool,
      actors.organiser,
      tripId,
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>(
            'SELECT * FROM llm.disruptions WHERE trip_id = $1',
            [tripId],
          )
        ).rows,
    );
    expect(rows.map((row) => row['title'])).toEqual(['Flight delayed']);
    for (const hidden of ['source_snapshot', 'chosen_by', 'affected']) {
      expect(rows[0], hidden).not.toHaveProperty(hidden);
    }
    const outsider = await withGuideReader(
      harness.db.pool,
      actors.outsider,
      tripId,
      async (tx) =>
        (await tx.query('SELECT 1 FROM llm.disruptions WHERE trip_id = $1', [tripId])).rowCount,
    );
    expect(outsider).toBe(0);
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM disruptions'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('grants the replication role read on the table it publishes', async () => {
    const { rows } = await harness.db.pool.query<{ ok: boolean }>(
      "SELECT has_table_privilege('powersync_repl', 'disruptions', 'SELECT') AS ok",
    );
    expect(rows[0]?.ok).toBe(true);
  });

  it('groups guide actions under a real disruption only', async () => {
    const { tripId } = harness.fixture;
    await expect(
      harness.db.pool.query(
        `INSERT INTO guide_actions (trip_id, kind, status, reversible, disruption_id)
         VALUES ($1, 'retime_item', 'planned', true, gen_random_uuid())`,
        [tripId],
      ),
    ).rejects.toThrow(/guide_actions_disruption_id_fkey/u);
  });
});
