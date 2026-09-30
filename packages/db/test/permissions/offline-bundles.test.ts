/**
 * `offline_bundles` (C1, RLS T): the day bundle manifest is readable by the trip's crew only (outsiders and former members get nothing) and synced on the trip stream; only the builder job writes it, never app_user.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';

import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('offline_bundles', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'offline_bundles');
  });
});
