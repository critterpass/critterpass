/**
 * A planned pause on the App Store, which has no pause of its own: the member turns renewal off in
 * the store and tells us when they mean to come back (`set_pause_intent`). The date lives on their
 * `subscriptions.resume_at`, the column Play's real pause also uses, so the sync with the store
 * has to tell the two apart: Play's date is the store's and follows it; the App Store never
 * reports one, so the member's date is kept until they turn renewal back on.
 */
import type { MappedSubscription } from './map-subscriber';

export interface StoredPause {
  readonly autoRenew: boolean;
  readonly resumeAt: Date | null;
}

/** The resume date a subscription row holds after a sync with the store. */
export function resumeAtAfterSync(
  existing: StoredPause | undefined,
  mapped: Pick<MappedSubscription, 'platform' | 'status' | 'autoRenew' | 'resumeAt'>,
): Date | null {
  if (mapped.resumeAt !== null) return mapped.resumeAt;
  if (mapped.platform !== 'app_store' || existing === undefined) return null;
  // Renewal turned back on: they are staying, so the plan to pause is over.
  const resubscribed = mapped.status === 'active' && mapped.autoRenew && !existing.autoRenew;
  return resubscribed ? null : existing.resumeAt;
}
