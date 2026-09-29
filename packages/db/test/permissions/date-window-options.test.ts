/**
 * `date_window_options` (C1, RLS T): the trip's window options are crew-visible and written by
 * the window job only. An ask-first option names the member and the outcome, never the event.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('date_window_options', () => {
  it('is crew-visible, read-only and synced with the trip', async () => {
    await expectCrewReadOnly(harness, 'date_window_options');
  });

  it('carries an ask outcome only with the member it concerns', async () => {
    const { tripId } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO date_window_options (trip_id, position, kind, start_date, end_date,
             free_count, member_count, reason, ask_status)
           VALUES ($1, 1, 'ask_first', current_date, current_date + 6, 5, 6, 'maybe_block', 'freed')`,
          [tripId],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});
