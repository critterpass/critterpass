/**
 * `stamp_signatures` (C1, RLS T via the viewer list): every traveller still in the crew reads the
 * signatures on the crew's trip stamps and syncs them on the trip stream; only the
 * `record_recap_view` command (app_system) writes one.
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

describe('stamp_signatures', () => {
  it('is read by the travellers only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'stamp_signatures');
  });
});
