import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { subscriptionState, type StoreSubscriptionDates } from './subscription-state';

const DAY = 86_400_000;
const NOW = new Date('2026-12-02T00:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);
const none: StoreSubscriptionDates = {
  expiresAt: null,
  billingIssueAt: null,
  unsubscribedAt: null,
  refundedAt: null,
  autoResumeAt: null,
};

describe('subscription machine', { timeout: 60_000 }, () => {
  it('keeps Pass+ for exactly the server grace after a billing failure, on both stores', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -30 * DAY, max: 30 * DAY }),
        fc.integer({ min: 0, max: 60 }),
        fc.constantFrom('app_store' as const, 'play' as const),
        fc.boolean(),
        (issueOffset, graceDays, platform, storeStillLive) => {
          const billingIssueAt = new Date(NOW.getTime() + issueOffset);
          const state = subscriptionState(
            { ...none, billingIssueAt, expiresAt: storeStillLive ? at(3) : at(-1) },
            platform,
            NOW,
            graceDays,
          );
          const graceEnd = billingIssueAt.getTime() + graceDays * DAY;
          expect(state.graceEndsAt?.getTime()).toBe(graceEnd);
          expect(state.status === 'grace').toBe(graceEnd > NOW.getTime());
          if (state.status !== 'grace') {
            const expected =
              storeStillLive || platform === 'app_store' ? 'billing_retry' : 'on_hold';
            expect(state.status).toBe(expected);
          }
        },
      ),
    );
  });

  it('revokes a refunded subscription whatever else the store says', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: -40, max: 40 })),
        fc.option(fc.integer({ min: -40, max: 0 })),
        fc.option(fc.integer({ min: -40, max: 0 })),
        (expires, issue, unsubscribed) => {
          const state = subscriptionState(
            {
              ...none,
              expiresAt: expires === null ? null : at(expires),
              billingIssueAt: issue === null ? null : at(issue),
              unsubscribedAt: unsubscribed === null ? null : at(unsubscribed),
              refundedAt: at(-1),
            },
            'app_store',
            NOW,
            7,
          );
          expect(state).toMatchObject({ status: 'revoked', autoRenew: false });
        },
      ),
    );
  });

  it('moves active → cancelled_active → expired with the period', () => {
    const period = { ...none, expiresAt: at(10) };
    expect(subscriptionState(period, 'play', NOW, 7).status).toBe('active');
    const cancelled = { ...period, unsubscribedAt: at(-1) };
    expect(subscriptionState(cancelled, 'play', NOW, 7)).toMatchObject({
      status: 'cancelled_active',
      autoRenew: false,
    });
    expect(subscriptionState(cancelled, 'play', at(11), 7).status).toBe('expired');
  });

  it('pauses a Play subscription only once its period ends, until it resumes', () => {
    const scheduled = { ...none, expiresAt: at(5), autoResumeAt: at(35) };
    expect(subscriptionState(scheduled, 'play', NOW, 7)).toMatchObject({
      status: 'active',
      pausedFrom: at(5),
      resumeAt: at(35),
    });
    expect(subscriptionState(scheduled, 'play', at(6), 7).status).toBe('paused');
    expect(subscriptionState(scheduled, 'play', at(36), 7).status).toBe('expired');
  });

  it('lets a cancelled subscription with a failed renewal lapse instead of retrying', () => {
    const state = subscriptionState(
      { ...none, expiresAt: at(-2), billingIssueAt: at(-3), unsubscribedAt: at(-2) },
      'app_store',
      NOW,
      7,
    );
    expect(state.status).toBe('expired');
  });
});
