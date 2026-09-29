/**
 * `paywall_impressions` (C2, RLS O): a user's own paywall history, synced to them so the governor
 * can decide offline; nobody else reads it and only the server writes.
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

describe('paywall_impressions', () => {
  it('is owner-only, read-only and synced on me', async () => {
    await expectOwnerOnlyTable(harness, 'paywall_impressions');
  });
});
