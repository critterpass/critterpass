/**
 * Referral fraud rules. A referral is void when the referee shares a device with the referrer (a
 * second account of the same person), when the referee's identity was already seen on another
 * account, or when the referrer has already qualified 20 referrals in the last 30 days (velocity).
 * A server flag can pause rewards without voiding anything.
 */

export const REFERRAL_VELOCITY_LIMIT = 20;
export const REFERRAL_VELOCITY_WINDOW_DAYS = 30;

export const REFERRAL_VOID_REASONS = ['self_referral', 'identity_reused', 'velocity'] as const;
export type ReferralVoidReason = (typeof REFERRAL_VOID_REASONS)[number];

export interface FraudFacts {
  /** A device (install) that both the referrer and the referee have signed in on. */
  readonly sharedDevice: boolean;
  readonly identitySeenBefore: boolean;
  /** Referrals this referrer qualified in the velocity window, this one excluded. */
  readonly referrerQualifiedInWindow: number;
}

export function referralVoidReason(facts: FraudFacts): ReferralVoidReason | null {
  if (facts.sharedDevice) return 'self_referral';
  if (facts.identitySeenBefore) return 'identity_reused';
  if (facts.referrerQualifiedInWindow >= REFERRAL_VELOCITY_LIMIT) return 'velocity';
  return null;
}
