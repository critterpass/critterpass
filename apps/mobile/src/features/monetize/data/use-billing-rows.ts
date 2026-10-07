/**
 * What the signed-in person has, read live from the synced rows: subscriptions, the server's
 * resolved Pass+ flag, the perk list and the product catalogue. Screens gate on these rows only;
 * a purchase changes nothing here until the server's rows arrive.
 */
import type { ProductKey, StoreIds } from '@cp/domain';
import type { Perk } from '@cp/entitlements';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import {
  catalogueFromRows,
  ENTITLEMENT_SQL,
  ENTITLEMENT_TABLES,
  ME_SQL,
  ME_TABLES,
  perkFromRow,
  PERKS_SQL,
  PERKS_TABLES,
  PRODUCTS_SQL,
  PRODUCTS_TABLES,
  subscriptionFromRow,
  SUBSCRIPTIONS_SQL,
  SUBSCRIPTIONS_TABLES,
  type EntitlementRow,
  type PerkRow,
  type ProductRow,
  type Subscription,
  type SubscriptionRow,
} from './billing-rows';
import { useOwnerUid } from './use-billing';

export interface BillingRows {
  readonly uid: string | null;
  /** False until the subscription and entitlement rows have been read once. */
  readonly loaded: boolean;
  readonly name: string;
  readonly passPlus: boolean;
  /** When the resolved Pass+ ends, whatever grants it; null when open-ended or off. */
  readonly passPlusUntil: string | null;
  readonly subscriptions: readonly Subscription[];
  readonly perks: readonly Perk[];
  readonly catalogue: ReadonlyArray<{ readonly key: ProductKey; readonly storeIds: StoreIds }>;
}

const NO_PARAMS: readonly unknown[] = [];

export function useBillingRows(): BillingRows {
  const uid = useOwnerUid();
  const own = useMemo(() => (uid === null ? null : [uid]), [uid]);
  const me = useLiveRows<{ display_name: string | null }>(ME_SQL, own, ME_TABLES);
  const subs = useLiveRows<SubscriptionRow>(SUBSCRIPTIONS_SQL, own, SUBSCRIPTIONS_TABLES);
  const entitlement = useLiveRows<EntitlementRow>(ENTITLEMENT_SQL, own, ENTITLEMENT_TABLES);
  const perkRows = useLiveRows<PerkRow>(PERKS_SQL, NO_PARAMS, PERKS_TABLES);
  const productRows = useLiveRows<ProductRow>(PRODUCTS_SQL, NO_PARAMS, PRODUCTS_TABLES);

  const subscriptions = useMemo(
    () =>
      subs.rows.flatMap((row) => {
        const subscription = subscriptionFromRow(row);
        return subscription === null ? [] : [subscription];
      }),
    [subs.rows],
  );
  const perks = useMemo(
    () =>
      perkRows.rows.flatMap((row) => {
        const perk = perkFromRow(row);
        return perk === null ? [] : [perk];
      }),
    [perkRows.rows],
  );
  const catalogue = useMemo(() => catalogueFromRows(productRows.rows), [productRows.rows]);

  return {
    uid,
    loaded: subs.loaded && entitlement.loaded,
    name: me.rows[0]?.display_name ?? '',
    passPlus: entitlement.rows[0]?.pass_plus === 1,
    passPlusUntil: entitlement.rows[0]?.expires_at ?? null,
    subscriptions,
    perks,
    catalogue,
  };
}
