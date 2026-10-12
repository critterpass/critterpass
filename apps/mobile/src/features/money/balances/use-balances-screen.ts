/**
 * What either Money home shows: the crew and trip from synced rows, the balances from the trip's
 * ledger through the engine, the expenses (queued ones included, marked pending). A trip hub's
 * Money or Bookings tile names its trip, and both halves open on it. A ledger that does not add up
 * yet (its rows are still arriving) waits as loading for a moment, then says it is still syncing.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { useSyncPhase } from '@/data/status/use-sync-status';
import { openWalletTrip, useWalletTripId } from '@/features/bookings';

import { expenseItems, type ExpenseItem } from '../data/expense-items';
import { useMoneyServices } from '../data/services';
import { selectTrip, useSelectedTrip } from '../data/selected-trip';
import type { MoneyCrew, MoneyTrip } from '../data/context';
import type { MoneyContext } from '../data/use-money-context';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney, type TripMoneyRows } from '../data/use-trip-money';
import { useReceiptQueueDrain } from '../receipt/receipt-queue';
import { expenseRoute, MONEY_ROUTES } from '../routes';
import { buildBalances, isSolo, type BalancesModel } from './model';

/** How long a ledger that does not net to zero waits as loading before saying so. */
const SYNCING_AFTER_MS = 4000;

/** True once `active` has held for `ms` without a break. */
function useHeldFor(active: boolean, ms: number): boolean {
  // One token per stretch of `active`: a timer that fired for an earlier stretch counts for nothing.
  const stretch = useMemo(() => ({ active }), [active]);
  const [held, setHeld] = useState<object | null>(null);
  useEffect(() => {
    if (!stretch.active) return undefined;
    const timer = setTimeout(() => setHeld(stretch), ms);
    return () => clearTimeout(timer);
  }, [stretch, ms]);
  return active && held === stretch;
}

export interface BalancesReady {
  readonly kind: 'ready';
  readonly ctx: MoneyContext;
  readonly crew: MoneyCrew;
  readonly trip: MoneyTrip;
  readonly rows: TripMoneyRows;
  readonly model: BalancesModel;
  readonly items: readonly ExpenseItem[];
  readonly currency: string;
  /** Currencies an organiser can switch the crew to. */
  readonly choices: readonly string[];
  readonly empty: boolean;
  readonly solo: boolean;
  readonly offline: boolean;
}

export type BalancesScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'syncing'; readonly items: readonly ExpenseItem[]; readonly currency: string }
  | { readonly kind: 'none'; readonly crew: boolean }
  | BalancesReady;

export const balancesNav = {
  settle: () => router.push(MONEY_ROUTES.settle),
  scan: () => router.push(MONEY_ROUTES.scan),
  add: () => router.push(MONEY_ROUTES.add),
  budget: () => router.push(MONEY_ROUTES.budget),
  history: () => router.push(MONEY_ROUTES.history),
  expense: (id: string) => router.push(expenseRoute(id)),
};

export function useBalancesScreen(): BalancesScreenState {
  const selected = useSelectedTrip();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const openedFor = useWalletTripId();
  useLayoutEffect(() => {
    if (typeof tripId === 'string' && tripId !== '') openWalletTrip(tripId);
  }, [tripId]);
  useLayoutEffect(() => {
    if (openedFor !== null) selectTrip(openedFor);
  }, [openedFor]);
  useReceiptQueueDrain(useMoneyServices());
  const ctx = useMoneyContext(selected);
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const syncPhase = useSyncPhase();
  const currency = ctx.crew?.settlementCurrency ?? 'USD';

  const model = useMemo(() => {
    if (ctx.uid === null || ctx.trip === null) return null;
    try {
      return buildBalances({
        uid: ctx.uid,
        members: ctx.members,
        shown: ctx.splitMembers,
        ledger: rows.ledger,
        payments: rows.payments,
        expenses: rows.expenses,
        currency,
      });
    } catch {
      // A ledger mid-sync that does not net to zero yet: wait for the next checkpoint.
      return null;
    }
  }, [ctx, rows, currency]);

  const items = useMemo(
    () =>
      ctx.trip === null
        ? []
        : expenseItems({
            expenses: rows.expenses,
            shares: rows.shares,
            pending: rows.pending,
            members: ctx.members,
            tripId: ctx.trip.id,
            tz: ctx.trip.tz,
            crewCurrency: currency,
          }),
    [ctx.trip, ctx.members, rows, currency],
  );
  const unbalancedFor = useHeldFor(
    ctx.status === 'ready' && rows.loaded && model === null,
    SYNCING_AFTER_MS,
  );

  if (unbalancedFor) return { kind: 'syncing', items, currency };
  if (ctx.status === 'loading' || (ctx.status === 'ready' && (!rows.loaded || model === null))) {
    return { kind: 'loading' };
  }
  if (ctx.status !== 'ready' || model === null || ctx.crew === null || ctx.trip === null) {
    return { kind: 'none', crew: ctx.status === 'no_trip' };
  }
  const trip = ctx.trip;
  return {
    kind: 'ready',
    ctx,
    crew: ctx.crew,
    trip,
    rows,
    model,
    items,
    currency,
    choices: [
      ...new Set(
        [currency, trip.localCurrency, ctx.homeCurrency].filter(
          (value): value is string => value !== null,
        ),
      ),
    ],
    empty: items.length === 0 && rows.ledger.length === 0,
    solo: isSolo(ctx.uid ?? '', ctx.members, model.lines),
    offline: syncPhase === 'offline',
  };
}
