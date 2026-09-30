/**
 * `record_paywall_event` keeps each paywall moment once (a queued offline replay lands once), for
 * the caller only, and only against a trip the caller can see.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildMoneyCrew } from '../money/money-harness';
import { errorOf } from '../setup/setup-harness';
import { startBillingHarness, type BillingHarness } from './billing-harness';

let harness: BillingHarness;

beforeAll(async () => {
  harness = await startBillingHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('record_paywall_event', () => {
  it('records a quiet no once, and refuses a trip the caller is not on', async () => {
    const crew = await buildMoneyCrew(harness, 2);
    const event = {
      id: generateUuidV7(),
      entry_point: 'live_map',
      trip_id: crew.tripId,
      kind: 'quiet_no',
      local_date: '2026-10-01',
    };
    const opId = generateUuidV7();
    expect(
      (await harness.run(crew.organiser, 'record_paywall_event', event, { opId })).status,
    ).toBe(200);
    expect((await harness.run(crew.organiser, 'record_paywall_event', event)).status).toBe(200);
    const { rows } = await harness.pool.query(
      'SELECT outcome, governed, channel FROM paywall_impressions WHERE id = $1',
      [event.id],
    );
    expect(rows).toEqual([{ outcome: 'quiet_no', governed: false, channel: 'app' }]);

    const outsider = await harness.signIn();
    const refused = await harness.run(outsider, 'record_paywall_event', {
      ...event,
      id: generateUuidV7(),
    });
    expect(errorOf(refused).code).toBe('NOT_FOUND');
  });
});
