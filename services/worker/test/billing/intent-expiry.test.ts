/**
 * `billing.intent_expiry` fires from the intent's timer and asks the api to lapse that intent;
 * one job per intent, and an intent the api no longer knows is recorded, not retried.
 */
import { describe, expect, it } from 'vitest';

import { createBillingDoor } from '../../src/jobs/billing/door-client';
import { intentExpiryJob } from '../../src/jobs/billing/intent-expiry';
import { jobContext, recordedDoor } from './door-fixture';

const INTENT = '01920000-0000-7000-8000-0000000000aa';
const timer = {
  scheduled_event_id: '01920000-0000-7000-8000-0000000000ab',
  ref_id: INTENT,
  slot: '',
  due_at: '2026-10-01T00:15:00.000Z',
  data: {},
};

describe('billing.intent_expiry', () => {
  it('lapses the intent its timer names, once per intent', async () => {
    const door = recordedDoor([
      { status: 200, body: { result: { intent_id: INTENT, status: 'expired' } } },
      { status: 422, body: { error: { code: 'NOT_FOUND' } } },
    ]);
    const job = intentExpiryJob(
      createBillingDoor({
        baseUrl: 'http://api',
        secret: 'door'.repeat(6),
        fetch: door.fetch,
      }),
    );
    const { ctx } = jobContext();
    expect(job.singletonKey?.(timer)).toBe(INTENT);
    await expect(job.handler(timer, ctx)).resolves.toEqual({
      result: { intent_id: INTENT, status: 'expired' },
    });
    expect(door.calls[0]).toMatchObject({
      url: 'http://api/internal/billing/expire_intent',
      body: { intent_id: INTENT },
    });
    await expect(job.handler(timer, ctx)).resolves.toEqual({ refused: 'NOT_FOUND' });
  });
});
