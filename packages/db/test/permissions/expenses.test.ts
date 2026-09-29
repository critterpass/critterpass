/**
 * `expenses` and `expense_edits` (C1, RLS T): a trip's expenses and their edit history are
 * crew-visible, written only by the money commands as the server, and synced with the trip to its
 * crew. The edit history is append-only for every role.
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

describe('expenses', () => {
  it('is crew-visible, read-only and synced with the trip', async () => {
    await expectCrewReadOnly(harness, 'expenses');
  });

  it('keeps the edit history crew-visible and append-only, even for the server', async () => {
    await expectCrewReadOnly(harness, 'expense_edits');
    await expect(
      withSystem(harness.db.pool, (tx) => tx.query("UPDATE expense_edits SET kind = 'edited'")),
    ).rejects.toThrow(/permission denied|append-only/i);
    await expect(harness.db.pool.query('DELETE FROM expense_edits')).rejects.toThrow(
      /append-only/i,
    );
  });

  it('drops a deleted expense from the trip stream', async () => {
    const { tripId } = harness.fixture;
    await harness.db.pool.query(
      'UPDATE expenses SET deleted_at = now(), deleted_by = payer_id WHERE trip_id = $1',
      [tripId],
    );
    const synced = await harness.rows('trip', 'member', { trip_id: tripId });
    expect(synced.get('expenses') ?? []).toEqual([]);
  });
});
