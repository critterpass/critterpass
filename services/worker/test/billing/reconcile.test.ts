/**
 * `billing.reconcile` walks every due customer through the api in batches, following the cursor
 * the api returns until there is none, and adds up what each batch checked, repaired and failed.
 */
import { describe, expect, it } from 'vitest';

import { createBillingDoor } from '../../src/jobs/billing/door-client';
import { RECONCILE_BATCH, runReconcile } from '../../src/jobs/billing/reconcile';
import { recordedDoor } from './door-fixture';

const A = '01920000-0000-7000-8000-00000000000a';
const B = '01920000-0000-7000-8000-00000000000b';

const batch = (checked: number, drifted: number, failed: number, next: string | null) => ({
  status: 200,
  body: { result: { checked, drifted, failed, next_after_user_id: next } },
});

describe('billing.reconcile', () => {
  it('follows the cursor to the end and totals every batch', async () => {
    const door = recordedDoor([batch(100, 3, 0, A), batch(100, 1, 1, B), batch(12, 0, 0, null)]);
    const totals = await runReconcile(
      createBillingDoor({
        baseUrl: 'http://api',
        secret: 'door'.repeat(6),
        fetch: door.fetch,
      }),
    );
    expect(totals).toEqual({ checked: 212, drifted: 4, failed: 1, complete: true });
    expect(door.calls.map((call) => call.body)).toEqual([
      { after_user_id: null, limit: RECONCILE_BATCH },
      { after_user_id: A, limit: RECONCILE_BATCH },
      { after_user_id: B, limit: RECONCILE_BATCH },
    ]);
  });

  it('stops at its time budget and reports the run incomplete', async () => {
    const door = recordedDoor([batch(100, 0, 0, A), batch(100, 0, 0, B)]);
    let clock = 0;
    const totals = await runReconcile(
      createBillingDoor({
        baseUrl: 'http://api',
        secret: 'door'.repeat(6),
        fetch: door.fetch,
      }),
      () => {
        clock += 20 * 60 * 1000;
        return clock;
      },
    );
    expect(totals).toMatchObject({ checked: 200, complete: false });
    expect(door.calls).toHaveLength(2);
  });

  it('fails the run when the api refuses it, so the cron retries', async () => {
    const door = recordedDoor([{ status: 500, body: { error: { code: 'INTERNAL' } } }]);
    await expect(
      runReconcile(
        createBillingDoor({
          baseUrl: 'http://api',
          secret: 'door'.repeat(6),
          fetch: door.fetch,
        }),
      ),
    ).rejects.toThrow(/500/);
  });
});
