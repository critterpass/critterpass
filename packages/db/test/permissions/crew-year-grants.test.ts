/**
 * `crew_year_grants` (C2, RLS M): the crew sees its crew yearly boost; the buyer keeps seeing the
 * grant they pay for; only the server writes.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';

import { expectCrewBillingTable } from '../helpers/billing-fixture';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('crew_year_grants', () => {
  it('is crew-visible, read-only and synced with the crew', async () => {
    await expectCrewBillingTable(harness, 'crew_year_grants', 'crews');
  });
});
