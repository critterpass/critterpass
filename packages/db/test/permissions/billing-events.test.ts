/**
 * `billing_events` (C5, RLS S): every provider event exactly once. System-only, unpublished; a
 * redelivered event is a no-op insert.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('billing_events', () => {
  it('stores a redelivered event once', async () => {
    const { rowCount } = await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO billing_events (source, event_id, type, payload)
         VALUES ('revenuecat', 'fixture-event-1', 'RENEWAL', '{}')
         ON CONFLICT (source, event_id) DO NOTHING`,
      ),
    );
    expect(rowCount).toBe(0);
  });
});
