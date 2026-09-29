/**
 * `billing.apply` asks the api to apply one stored RevenueCat event through the internal door,
 * with the shared secret. A refusal that can never succeed is recorded and not retried; anything
 * transient (RevenueCat down, the api restarting) throws so pg-boss retries it, then dead-letters.
 */
import { describe, expect, it } from 'vitest';

import { billingApplyJob } from '../../src/jobs/billing/apply';
import { createBillingDoor } from '../../src/jobs/billing/door-client';
import { jobContext, recordedDoor } from './door-fixture';

const EVENT = '01920000-0000-7000-8000-000000000001';
const SECRET = 'door'.repeat(6);

function jobWith(responses: Array<{ status: number; body: unknown }>) {
  const door = recordedDoor(responses);
  const job = billingApplyJob(
    createBillingDoor({ baseUrl: 'http://api.internal:8787/', secret: SECRET, fetch: door.fetch }),
  );
  return { job, calls: door.calls };
}

describe('billing.apply', () => {
  it('applies the stored event through the api with the shared secret', async () => {
    const { job, calls } = jobWith([{ status: 200, body: { result: 'applied' } }]);
    const { ctx } = jobContext();
    await expect(job.handler({ billing_event_id: EVENT }, ctx)).resolves.toEqual({
      outcome: 'applied',
    });
    expect(calls).toEqual([
      {
        url: 'http://api.internal:8787/internal/billing/apply_event',
        secret: SECRET,
        body: { billing_event_id: EVENT },
      },
    ]);
    expect(job.singletonKey?.({ billing_event_id: EVENT })).toBe(EVENT);
  });

  it('records a permanent refusal without retrying', async () => {
    const { job } = jobWith([
      { status: 422, body: { error: { code: 'NOT_FOUND', retryable: false } } },
    ]);
    const { ctx, warnings } = jobContext();
    await expect(job.handler({ billing_event_id: EVENT }, ctx)).resolves.toEqual({
      refused: 'NOT_FOUND',
    });
    expect(warnings).toHaveLength(1);
  });

  it('throws on a transient failure so the queue retries it', async () => {
    const { job } = jobWith([
      { status: 503, body: { error: { code: 'SUPPLIER_UNAVAILABLE', retryable: true } } },
    ]);
    const { ctx } = jobContext();
    await expect(job.handler({ billing_event_id: EVENT }, ctx)).rejects.toThrow(/503/);
  });
});
