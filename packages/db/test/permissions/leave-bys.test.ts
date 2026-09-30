/**
 * `leave_bys` (C1, RLS T): a leave-by is crew-visible: every active member of the trip's crew reads it and syncs it on the trip stream; the leave-by jobs write it as app_system and the organiser edits its buffer through a command.
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

describe('leave_bys', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'leave_bys');
  });
});
