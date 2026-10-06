/**
 * The plan surfaces' shared state: the plan read from the synced rows, the boosts of the person's
 * trips, the store's sheets and a re-check. A re-check asks the store what this account holds and
 * has the server verify each purchase again, which is also how a fixed payment shows up at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- URLs, never copy. */
import { useCallback, useMemo } from 'react';
import { Linking, Platform } from 'react-native';

import { storePlatform, type StorePort } from '@/data/billing';
import { useLiveRows } from '@/data/plan/live-rows';

import { BOOSTS_SQL, BOOSTS_TABLES, type BoostRow } from '../data/billing-rows';
import { useRestore, useStore, type RestoreState } from '../data/use-billing';
import { useBillingRows, type BillingRows } from '../data/use-billing-rows';
import { boostLines, planModel, type BoostLine, type PlanModel } from './plan-model';

/** Where each store lists a person's subscriptions, for a phone with no store SDK configured. */
const SUBSCRIPTIONS_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

const NO_PARAMS: readonly unknown[] = [];

export interface PlanState {
  readonly rows: BillingRows;
  readonly store: StorePort | null;
  /** Null until the rows have been read. */
  readonly plan: PlanModel | null;
  readonly boosts: readonly BoostLine[];
  readonly restore: RestoreState;
  readonly recheck: () => void;
  /** Opens the store's own subscription page. */
  readonly manage: () => void;
}

export function usePlan(): PlanState {
  const rows = useBillingRows();
  const store = useStore(rows.uid);
  const { state: restore, restore: recheck } = useRestore(store);
  const boostRows = useLiveRows<BoostRow>(BOOSTS_SQL, NO_PARAMS, BOOSTS_TABLES);
  const boosts = useMemo(() => boostLines(boostRows.rows), [boostRows.rows]);
  const plan = rows.loaded
    ? planModel({
        subscriptions: rows.subscriptions,
        passPlus: rows.passPlus,
        passPlusUntil: rows.passPlusUntil,
        deviceStore: storePlatform(),
      })
    : null;
  const manage = useCallback(() => {
    if (store === null) {
      void Linking.openURL(SUBSCRIPTIONS_URL);
      return;
    }
    store.showManageSubscriptions().catch(() => Linking.openURL(SUBSCRIPTIONS_URL));
  }, [store]);
  return { rows, store, plan, boosts, restore, recheck, manage };
}
