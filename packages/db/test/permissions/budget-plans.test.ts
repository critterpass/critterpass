/**
 * `budget_plans` (C1, RLS T): the locked budget target is crew-visible and written only by the
 * lock command as the server.
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

describe('budget_plans', () => {
  it('is crew-visible, read-only and synced with the trip', async () => {
    await expectCrewReadOnly(harness, 'budget_plans');
  });
});
