/**
 * Where a store subscription sits on the subscription machine (docs/data-model-sync-and-privacy.md
 * §3.6), from the dates the store reports (pure; the api feeds it RevenueCat's customer read).
 * Our grace is server-side and the same on both stores: `graceDays` (7 by default) after the store
 * first failed to bill, whatever grace the store itself was configured with.
 */
import type { StorePlatform, SubscriptionState } from './states';

const DAY_MS = 86_400_000;

export interface StoreSubscriptionDates {
  readonly expiresAt: Date | null;
  readonly billingIssueAt: Date | null;
  readonly unsubscribedAt: Date | null;
  readonly refundedAt: Date | null;
  /** Play's scheduled resume after a pause. */
  readonly autoResumeAt: Date | null;
}

export interface SubscriptionStateResult {
  readonly status: SubscriptionState;
  readonly autoRenew: boolean;
  readonly graceEndsAt: Date | null;
  readonly pausedFrom: Date | null;
  readonly resumeAt: Date | null;
}

export function serverGraceEndsAt(billingIssueAt: Date, graceDays: number): Date {
  return new Date(billingIssueAt.getTime() + graceDays * DAY_MS);
}

export function subscriptionState(
  dates: StoreSubscriptionDates,
  platform: StorePlatform,
  now: Date,
  graceDays: number,
): SubscriptionStateResult {
  const nowMs = now.getTime();
  const unsubscribed = dates.unsubscribedAt !== null;
  const live = dates.expiresAt === null || dates.expiresAt.getTime() > nowMs;
  const resuming = dates.autoResumeAt !== null && dates.autoResumeAt.getTime() > nowMs;
  const base: SubscriptionStateResult = {
    status: 'active',
    autoRenew: !unsubscribed,
    graceEndsAt: null,
    // A scheduled pause starts when the current period ends.
    pausedFrom: resuming ? dates.expiresAt : null,
    resumeAt: resuming ? dates.autoResumeAt : null,
  };
  if (dates.refundedAt !== null) return { ...base, status: 'revoked', autoRenew: false };
  if (resuming && !live) return { ...base, status: 'paused' };
  const grace =
    dates.billingIssueAt === null ? null : serverGraceEndsAt(dates.billingIssueAt, graceDays);
  if (grace !== null && !unsubscribed) {
    if (grace.getTime() > nowMs) return { ...base, status: 'grace', graceEndsAt: grace };
    if (live) return { ...base, status: 'billing_retry', graceEndsAt: grace };
    // Past our grace and the store's period: Play holds the account, the App Store keeps retrying.
    return {
      ...base,
      status: platform === 'play' ? 'on_hold' : 'billing_retry',
      graceEndsAt: grace,
    };
  }
  if (!live) return { ...base, status: 'expired', autoRenew: false, graceEndsAt: grace };
  return { ...base, status: unsubscribed ? 'cancelled_active' : 'active' };
}
