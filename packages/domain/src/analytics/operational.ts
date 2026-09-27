/**
 * The operational allow-list: the only events sent for an actor who has not granted analytics
 * consent. Billing and fraud facts only, sent server-side without a person profile, without
 * device props and under a per-event distinct id, so they count revenue and abuse without
 * following anyone. Every other event for such an actor is skipped.
 */
import type { AnalyticsEventName } from './catalog';

export const NO_CONSENT_ALLOWED = [
  'purchase_completed',
  'purchase_refunded',
  'referral_qualified',
  'trial_converted',
] as const satisfies readonly AnalyticsEventName[];

export function isNoConsentAllowed(event: AnalyticsEventName): boolean {
  return (NO_CONSENT_ALLOWED as readonly string[]).includes(event);
}
