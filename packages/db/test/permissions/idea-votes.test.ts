/**
 * `idea_votes` (C2, RLS O): a voter's own votes, synced to them on me so the board knows which
 * ideas they voted for and how much of the month's budget is left; only the server writes.
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

describe('idea_votes', () => {
  it('is owner-only, read-only and synced on me', async () => {
    await expectOwnerOnlyTable(harness, 'idea_votes');
  });
});
