/**
 * `readiness` (C1, RLS T): who is up is crew-visible: members read every row of the trip and sync it on the trip stream; a member's own row changes only through set_readiness or snooze_leave_by (app_system), never app_user.
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

describe('readiness', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'readiness');
  });
});
