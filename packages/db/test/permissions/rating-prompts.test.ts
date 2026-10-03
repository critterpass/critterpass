/**
 * `rating_prompts` (C2, RLS O): when the app asked the store for a review, synced to its owner so
 * the rating rules can decide offline; nobody else reads it and only the server writes.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';

import { expectOwnerOnlyTable } from '../helpers/billing-fixture';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('rating_prompts', () => {
  it('is owner-only, read-only and synced on me', async () => {
    await expectOwnerOnlyTable(harness, 'rating_prompts');
  });
});
