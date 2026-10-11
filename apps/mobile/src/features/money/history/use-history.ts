/**
 * The expense history of the trip Money shows, for either UI, from synced rows plus the offline
 * queue. The list is built once per change of the rows; the filters only pick from it. A link may
 * open it filtered to one member (`?member=`, from a name on the balances chart).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { expenseItems, filterItems, type ExpenseFilter } from '../data/expense-items';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { expenseRoute, MONEY_ROUTES } from '../routes';

export function useHistory() {
  const params = useLocalSearchParams<{ member?: string }>();
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const [filter, setFilter] = useState<ExpenseFilter>({
    memberId: typeof params.member === 'string' ? params.member : null,
    category: null,
  });
  const currency = ctx.crew?.settlementCurrency ?? 'USD';
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
  const shown = useMemo(() => filterItems(items, filter), [items, filter]);
  const members = useMemo(
    () =>
      ctx.members.filter((member) =>
        items.some(
          (item) => item.inSplit.includes(member.userId) || item.payerId === member.userId,
        ),
      ),
    [ctx.members, items],
  );
  const onExpense = useCallback((id: string) => router.push(expenseRoute(id)), []);
  const onAdd = useCallback(() => router.push(MONEY_ROUTES.add), []);
  const loading = ctx.status === 'loading' || (ctx.status === 'ready' && !rows.loaded);
  return {
    loading,
    noTrip: !loading && ctx.trip === null,
    hasCrew: ctx.crew !== null,
    items,
    shown,
    members,
    currency,
    filter,
    setFilter,
    onExpense,
    onAdd,
  };
}
