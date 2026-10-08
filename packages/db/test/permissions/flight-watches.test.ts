/**
 * `flight_watches` (C2, RLS S): provider alert subscriptions are the server's. No actor, no
 * guide_reader, no replication role, publication or stream can read them.
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

describe('flight watches', () => {
  it('is readable by the system role', async () => {
    const { rows } = await withSystem(harness.db.pool, (tx) =>
      tx.query("SELECT 1 FROM flight_watches WHERE provider_alert_id = 'matrix-alert'"),
    );
    expect(rows).toHaveLength(1);
  });
});
