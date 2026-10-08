/**
 * The plan as far as the billing banner needs it: the subscription and entitlement rows alone. The
 * banner sits on Home and the profile, so it must not carry what the plan pages read (boosts,
 * perks, products, the store).
 */
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import { storePlatform } from '@/data/billing';
import { useLiveRows } from '@/data/plan/live-rows';

import {
  ENTITLEMENT_SQL,
  ENTITLEMENT_TABLES,
  SUBSCRIPTIONS_SQL,
  SUBSCRIPTIONS_TABLES,
  subscriptionFromRow,
  type EntitlementRow,
  type SubscriptionRow,
} from '../data/billing-rows';
import { useOwnerUid } from '../data/use-billing';
import { planModel, type PlanModel } from './plan-model';

/** The plan while a renewal has failed; null otherwise (and until the rows have been read). */
export function useBillingIssue(): PlanModel | null {
  const uid = useOwnerUid();
  const own = useMemo(() => (uid === null ? null : [uid]), [uid]);
  const subs = useLiveRows<SubscriptionRow>(SUBSCRIPTIONS_SQL, own, SUBSCRIPTIONS_TABLES);
  const entitlement = useLiveRows<EntitlementRow>(ENTITLEMENT_SQL, own, ENTITLEMENT_TABLES);
  return useMemo(() => {
    if (!subs.loaded || !entitlement.loaded || subs.rows.length === 0) return null;
    const plan = planModel({
      subscriptions: subs.rows.flatMap((row) => {
        const subscription = subscriptionFromRow(row);
        return subscription === null ? [] : [subscription];
      }),
      passPlus: entitlement.rows[0]?.pass_plus === 1,
      passPlusUntil: entitlement.rows[0]?.expires_at ?? null,
      deviceStore: storePlatform(),
    });
    return plan.hasIssue ? plan : null;
  }, [subs.loaded, subs.rows, entitlement.loaded, entitlement.rows]);
}

/**
 * Coming back to the app from the store's own page (cancel, pause, a fixed payment): the server is
 * asked to check the subscription again, so the page says what changed without waiting for sync.
 */
export function useRecheckOnReturn(recheck: () => void, then?: () => void): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      recheck();
      then?.();
    });
    return () => subscription.remove();
  }, [recheck, then]);
}
