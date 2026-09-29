/**
 * `room_plans` (C1, RLS T): the room plan is visible to the whole crew before the proposal and is
 * changed only through the organiser's commands, which write as the server.
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

describe('room_plans', () => {
  it('is crew-visible, read-only and synced with the trip', async () => {
    await expectCrewReadOnly(harness, 'room_plans');
  });
});
